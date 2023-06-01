import { PromptTemplate } from "langchain/prompts";
import { LLMChain, LLMChainInput } from "langchain/chains";
import { Callbacks } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";

export const RESPONSE_INPUT = "response";
export const SCRATCHPAD_INPUT = "scratchpad";

export const GUIDANCE = `
You are an AI assistant responsible for documenting the sequence of actions taken towards a particular objective.

Here is the history of past actions and experiences to achieve an objective: {${ SCRATCHPAD_INPUT }}

Based on these past actions and experiences, the AI responded with: {${ RESPONSE_INPUT }}

Using the above directions and information, respond with the following format:
\"\"\"
Objective: the derived objective phrased as a question or directive for later recall
Actions: a summary of the actions taken to meet the objective
Final Response: a summary of the AI response suitable with enough detail to support future recall
...(include significant individuals, locations, and concepts; preserve entities and acronyms including proper nouns.)
\"\"\"
`;

interface CondenserInput {
    model: BaseLanguageModel;
    callbacks?: Callbacks;
}

export class MemoryCondenser extends LLMChain {

    constructor(inputs: LLMChainInput) {
        super(inputs);
    }

    static makeChain({ model, callbacks }: CondenserInput): MemoryCondenser {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new MemoryCondenser({
            llm: model,
            callbacks: callbacks,
            prompt
        });
    }

    async evaluate({ response, scratchpad }: { response: string; scratchpad: string; }): Promise<string> {
        const completion = await this.call({
            response,
            scratchpad
        });
        return completion.text;
    }
}