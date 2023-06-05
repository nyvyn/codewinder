import { PromptTemplate } from "langchain/prompts";
import { LLMChainInput } from "langchain/chains";
import { Callbacks } from "langchain/callbacks";
import { BaseLanguageModel } from "langchain/base_language";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const EVALUATION = "Evaluation";
export const OBJECTIVE_INPUT = "objective";
export const RESPONSE_INPUT = "response";
export const SCRATCHPAD_INPUT = "scratchpad";
export const SCORE = "Score";
export const TOOL_INPUT = "tools";

export const GUIDANCE = `
An AI assistant is helping a user achieve this specific objective: 
{${OBJECTIVE_INPUT}}

The AI assistant was asked to use one or more tools to achieve this objective.
These are the allowed tools: 
{${TOOL_INPUT}}

Here is the history of past actions and experiences: 
\"\"\"{${SCRATCHPAD_INPUT}}\"\"\"

Based on these past actions and experiences, the AI has now responded with: 
\"\"\"{${RESPONSE_INPUT}}\"\"\"

Evaluate the response based on the following criteria:
* Does the response meet the stated objective based on the past actions and experiences?
* Is the response starting to go on a tangent or starting to drift from the original objective?
* Does the response duplicate past actions? (Avoid trying the same thing more than once)
* Does the response only select one or more tools from the allowed tools list?
* Are any of the actions dependent on each other? (Remove actions with dependencies)

Based on this evaluation, score the response on a scale of 1 to 5 with 1 being low and 5 is high.
This score should represent your confidence level of whether or note the responses will meet the objective.

Use this format to respond:
${EVALUATION}: evaluation of the response
${SCORE}: confidence score of the response from 1 to 5 (low to high)

If the score is low, then provide a new action (or actions) to take using the following format (only using allowed tools):
Action:
\`\`\`
[{{
  "action": "tool name",
  "action_input": "tool input"
}}]
\`\`\`
`;

interface EvaluatorInput {
    model: BaseLanguageModel;
    callbacks?: Callbacks;
}

export class ActionEvaluator extends GuardChain {

    constructor(inputs: LLMChainInput) {
        super(inputs);
    }

    static makeChain({model, callbacks}: EvaluatorInput): ActionEvaluator {
        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        return new ActionEvaluator({
            llm: model,
            callbacks: callbacks,
            prompt: prompt
        });
    }

    async predict({objective, response, scratchpad, tools}: {
        objective: string; response: string; scratchpad: string; tools: string
    }): Promise<string> {
        return await super.predict({
            objective,
            response,
            scratchpad,
            tools
        });
    }
}