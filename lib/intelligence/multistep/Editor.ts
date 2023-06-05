import { PromptTemplate } from "langchain/prompts";
import { LLMChainInput } from "langchain/chains";
import { Callbacks } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const CONTEXT_INPUT = "context";
export const OBJECTIVE_INPUT = "objective";

export const GUIDANCE = `
Provided the following text:
\"\"\"{${CONTEXT_INPUT}}\"\"\"

And using this as your guide: 
\"\"\"{${OBJECTIVE_INPUT}}\"\"\"

Rewrite the provided text: you may add, remove, or change the sections and headings as you see fit.
Use Github Flavored Markdown (GFM) to format your response. Never use HTML.
The revised text should include sources from the provided text, but you should never make up a url or link.
`;

interface EditorInput {
    model: BaseLanguageModel;
    callbacks?: Callbacks;
}

export class Editor extends GuardChain {

    constructor(inputs: LLMChainInput) {
        super(inputs);
    }

    static makeChain({model, callbacks}: EditorInput): Editor {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new Editor({
            llm: model,
            callbacks: callbacks,
            prompt: prompt
        });
    }

    async predict({context, objective}: { context: string; objective: string }): Promise<string> {
        return await super.predict({
            context,
            objective
        });
    }
}