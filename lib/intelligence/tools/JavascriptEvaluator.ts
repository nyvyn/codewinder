// Inspiration: https://github.com/MineDojo/Voyager/blob/main/voyager/prompts/action_response_format.txt

import { Tool, ToolParams } from "langchain/tools";
import { BaseLanguageModel } from "langchain/base_language";
import { LLMChain } from "langchain";
import { PromptTemplate } from "langchain/prompts";
import * as vm from "node:vm";
import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const NAME = "javascript-evaluator";
export const DESCRIPTION = `an AI-powered JavaScript evaluator.
Always inlude complete, relevant details in the specification from previous observations and actions.
Input is a specification for a function that will return the desired output as a string.
Input format:
{{
  "action": "${ NAME }",
  "action_input": "code specification in natural language"
}}`;

export const GUIDANCE = `
You are an AI assistant that is being provided a code specification.
Your responsibility is to write the appropriate function to be run in a secure code environment, returning the result to the requestor.

This is the code specification:
{specification}

The code you write should take into account these considerations:
* The environment the code will run in is an isolated Node.js environment with fetch() available.
   ...(here's an example using fetch: const response = await fetch('https://api.example.com/data');)
* You cannot require or import any new libraries and should never write code that relies upon environment variables.
* Code should be as simple as possible to meet the specification.
* All output should be software that is expected to immediately be interpreted and executed so as to return a string.

Here's a function you wrote similar to this in the past:
\`\`\`javascript
{example}
\`\`\`

Now, translate the natural language description into JavaScript code for immediate evaluation and return.

Always use this format:
Explain: ...
Plan:
1) ...
2) ...
3) ...
...
Code:
\`\`\`javascript
// helper functions (only if needed, try to avoid them)
...
// main function after the helper functions
(async function() {{
    function yourMainFunctionName() {{
      // ...
    }}

    return await yourMainFunctionName();
}})();
\`\`\`
`;

export interface JavascriptEvaluatorParams extends ToolParams {
    model: BaseLanguageModel;
    memory: MemoryStore;
}

export class JavascriptEvaluator extends Tool {
    public readonly name = NAME;
    public readonly description = DESCRIPTION;

    private readonly llmChain: LLMChain;
    private readonly memory: MemoryStore;

    constructor({ model, memory, verbose, callbacks }: JavascriptEvaluatorParams) {
        super(verbose, callbacks);

        const prompt = PromptTemplate.fromTemplate(GUIDANCE);

        this.llmChain = new GuardChain({
            llm: model,
            callbacks: callbacks,
            prompt
        });

        this.memory = memory;
    }

    /** @ignore */
    async _call(specification: string): Promise<string> {
        // Retrieve a similar example from memory.
        const memory = await this.memory.retrieveSnippets(specification, 0.80);
        const example = memory && memory.length > 0 ? memory[0].pageContent : "";

        // Generate JavaScript code from the natural language description.
        const completion = await this.llmChain.predict({ specification, example });

        const regex = /(?<=```javascript)[\s\S]*?(?=\n```)/;
        const matches = completion.match(regex);
        const match = matches.pop();

        try {
            // Evaluate the generated JavaScript code.
            const output = vm.runInNewContext(match, {
                console,
                fetch,
            }, { timeout: 3000 });
            const result = output ? await output : "No result returned.";

            // store this program for future reference
            await this.memory.storeTexts([match],  {
                specification: specification
            })

            return result;
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
}
