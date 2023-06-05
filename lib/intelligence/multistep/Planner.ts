import { PromptTemplate } from "langchain/prompts";
import { LLMChainInput } from "langchain/chains";
import { Callbacks } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const GUIDANCE = `
This is provided objective for the planner: 
\"\"\"{objective}\"\"\"

And tehse are the steps provided to the planner for evaluation:
\"\"\"{steps}\"\"\"

Rewrite the provided input: you may add, remove, or change the steps as you see fit.
Note: steps are expensive; combine and remove steps that are redundant or unnecessary.

When responding, ALWAYS use JSON and include the original objective and the updated steps.

ALWAYS respond using this format:
\`\`\`
{{
    "objective": "objective",
    "steps": [
        "step 1 + context from the objective",
        "step 2 + context from the objective"
    ]
}}
\`\`\`
   (each step won't have access to the objective, so the context from the objective should be included in each step)
   (the response should only contain a SINGLE objective, do NOT return a list of multiple objectives)
`;

interface PlannerInput {
    model: BaseLanguageModel;
    callbacks?: Callbacks;
}

export class Planner extends GuardChain {

    constructor(inputs: LLMChainInput) {
        super(inputs);
    }

    static makeChain({model, callbacks}: PlannerInput): Planner {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new Planner({
            llm: model,
            callbacks: callbacks,
            prompt: prompt
        });
    }

    async predict({objective, steps}: { objective: string, steps: string }): Promise<string> {
        return await super.predict({
            objective,
            steps
        });
    }
}