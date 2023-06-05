/**
 Guards against prompt inputs that exceed the maximum tokens for the model.
 */
import { LLMChain, LLMChainInput } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { Callbacks } from "langchain/dist/callbacks/manager";
import { calculateMaxTokens } from "langchain/base_language";
import { TiktokenModel } from "js-tiktoken/lite";

export const getModelNameForTiktoken = (modelName: string): TiktokenModel => {
    if (modelName.startsWith("gpt-3.5-turbo-")) {
        return "gpt-3.5-turbo";
    }

    if (modelName.startsWith("gpt-4-32k-")) {
        return "gpt-4-32k";
    }

    if (modelName.startsWith("gpt-4-")) {
        return "gpt-4";
    }

    return modelName as TiktokenModel;
};

export class GuardChain extends LLMChain {

    private readonly modelName: string;
    public outputKey: string = "output";

    get outputKeys() {
        return [this.outputKey];
    }

    constructor(inputs: LLMChainInput) {
        super(inputs);

        this.modelName = this.llm._identifyingParams()["model_name"];
    }

    async call(values: ChainValues & this["llm"]["CallOptions"], callbacks?: Callbacks | undefined): Promise<ChainValues> {
        const prompt = await this.prompt.format(values);

        const remainingTokens = await calculateMaxTokens({
            prompt,
            modelName: getModelNameForTiktoken(this.modelName)
        });

        if (remainingTokens < 0) {
            return {[this.outputKey]: "Your input exceeds the maximum number of tokens for this model."}
        } else {
            return super.call(values, callbacks);
        }
    }
}