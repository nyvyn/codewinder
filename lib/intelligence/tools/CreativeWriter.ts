import { Tool, ToolParams } from "langchain/tools";
import { CallbackManagerForToolRun } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";
import { PromptTemplate } from "langchain/prompts";
import { LLMChain } from "langchain/chains";

export const NAME = "creative-writer";
export const DESCRIPTION = `used to provide an edited, creative response. 
Input all context from previous actions and observations.`;
export const CONTEXT_INPUT = "context";

export const GUIDANCE = `
Provided the following text:
\"\"\"{${CONTEXT_INPUT}}\"\"\"

Rewrite the provided text: you may add, remove, or change the sections and headings as you see fit.
Use Github Flavored Markdown (GFM) to format your response. Never use HTML.
The revised text should include sources from the provided text, but you should never make up a url or link.
`;

interface FinalResponseParams extends ToolParams {
    model: BaseLanguageModel;
}

export class CreativeWriter extends Tool {
    public readonly name = NAME;
    public readonly description = DESCRIPTION;

    private readonly llmChain: LLMChain;

    // Return this response directly, no further processing needed.
    returnDirect = true;

    constructor({ model, verbose, callbacks }: FinalResponseParams) {
        super(verbose, callbacks);

        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        this.llmChain = new GuardChain({
            llm: model,
            callbacks: callbacks,
            prompt
        });
    }

    /** @ignore */
    async _call(input: string, runManager?: CallbackManagerForToolRun): Promise<string> {
        return await this.llmChain.predict({
            [CONTEXT_INPUT]: input
        }, runManager?.getChild());
    }
}
