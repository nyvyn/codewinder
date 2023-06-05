import { PromptTemplate } from "langchain/prompts";
import { LLMChainInput } from "langchain/chains";
import { Callbacks } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const CONTEXT_INPUT = "context";
export const CONTINUE_RESPONSE = "Thinking...";
export const FINAL_RESPONSE = "Final Response";
export const OBJECTIVE = "Objective";
export const OBJECTIVE_INPUT = "objective";

export const GUIDANCE = `
You are an AI assistant with the responsibility to determine if a stated objective can be easily and factually responded to.

This is the prior conversation:
\"\"\"{${CONTEXT_INPUT}}\"\"\"

Here is the stated ${OBJECTIVE}:
\"\"\"{${OBJECTIVE_INPUT}}\"\"\"

Is the ${OBJECTIVE}:
* a casual greeting or conversation
* a request to write, edit, debug, or to explain code, software, a function, or a program
* something that requires a creative response such as a joke or a poem
If so, then respond with \`${FINAL_RESPONSE}:\` followed by your response.

Alternatively, does the ${OBJECTIVE}:
* require more than one step or is comprised of multiple parts or directions
* make use of one or more complex calculations
* require executing code in a secure environment
* request or require searching or browsing the internet, web, or a database, etc.
* require access to one or more tools to accomplish the task
If so, then respond with \`${CONTINUE_RESPONSE}\` without further explanation.

All other cases should be responded to with \`${CONTINUE_RESPONSE}\` without further explanation.
`;

interface DirectorInput {
    model: BaseLanguageModel;
    callbacks?: Callbacks;
}

export class Director extends GuardChain {

    constructor(inputs: LLMChainInput) {
        super(inputs);
    }

    static makeChain({model, callbacks}: DirectorInput): Director {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new Director({
            llm: model,
            callbacks: callbacks,
            prompt: prompt
        });
    }

    async predict({context, memory, objective}: {
        context: string;
        memory: string;
        objective: string
    }): Promise<string> {
        return await super.predict({
            context,
            memory,
            objective
        });
    }
}