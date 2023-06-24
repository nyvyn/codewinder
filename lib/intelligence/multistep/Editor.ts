import { GuardChain, GuardChainInput } from "@/lib/intelligence/chains/GuardChain";
import { BaseLanguageModel } from "langchain/base_language";
import { Callbacks } from "langchain/callbacks";
import { PromptTemplate } from "langchain/prompts";

export const CONTEXT_INPUT = "context";
export const OBJECTIVE_INPUT = "objective";

export const GUIDANCE = `Provided the following text:
\"\"\"{${CONTEXT_INPUT}}\"\"\"

And using this as your guide: 
\"\"\"{${OBJECTIVE_INPUT}}\"\"\"

Rewrite the provided text: you may add, remove, or change the content as needed.
Use Github Flavored Markdown (GFM) to format the response (but never footnotes).
The revised text should include inline sources from the provided text, but you should never make up a url or link.`;

interface EditorInput {
    callbacks?: Callbacks;
    model: BaseLanguageModel;
}

export class Editor extends GuardChain {

    constructor(input: GuardChainInput) {
        super(input);
    }

    public static makeChain({model, callbacks}: EditorInput): Editor {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new Editor({
            llm: model,
            callbacks: callbacks,
            prompt: prompt
        });
    }

    public async predict({context, objective}: { context: string; objective: string }): Promise<string> {
        return await super.predict({
            context,
            objective
        });
    }
}