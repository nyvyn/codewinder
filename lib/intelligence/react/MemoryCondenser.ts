import { PromptTemplate } from "langchain/prompts";
import { LLMChainInput } from "langchain/chains";
import { Callbacks } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const RESPONSE_INPUT = "response";
export const ACTIONS_INPUT = "actions";

export const GUIDANCE = `
You are an AI assistant responsible for documenting the sequence of actions taken towards a particular objective.

Here is the history of past actions and experiences to achieve an objective:
\"\"\"{${ACTIONS_INPUT}}\"\"\"

Based on these past actions and experiences, the AI responded with: 
\"\"\"{${RESPONSE_INPUT}}\"\"\"

Using the above directions and information, respond with the following format:
Objective: the derived objective phrased as a question or directive for later recall
Actions: a summary of the actions taken to meet the objective
Final Response: a summary of the AI response suitable with enough detail to support future recall
...(include significant individuals, locations, and concepts; preserve entities and acronyms including proper nouns.)
`;

interface CondenserInput {
    model: BaseLanguageModel;
    callbacks?: Callbacks;
}

export class MemoryCondenser extends GuardChain {

    constructor(inputs: LLMChainInput) {
        super(inputs);
    }

    static makeChain({model, callbacks}: CondenserInput): MemoryCondenser {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new MemoryCondenser({
            llm: model,
            callbacks: callbacks,
            prompt: prompt
        });
    }

    async predict({actions, response}: { actions: string; response: string; }): Promise<string> {
        return await super.predict({
            actions,
            response
        });
    }
}