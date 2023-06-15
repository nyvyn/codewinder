// Inspiration: https://github.com/MineDojo/Voyager/blob/main/voyager/prompts/action_response_format.txt

import { Tool, ToolParams } from "langchain/tools";
import { BaseLanguageModel } from "langchain/base_language";
import { LLMChain } from "langchain";
import { PromptTemplate } from "langchain/prompts";
import * as vm from "node:vm";
import { MemoryStore } from "@/lib/intelligence/memory/MemoryStore";
import { GuardChain } from "@/lib/intelligence/chains/GuardChain";

export const NAME = "code-executor";
export const DESCRIPTION = `a Javascript environment designed to create and execute code based on a detailed, specific description.
Use this tool to call external APIs and to make network calls. The aim is to return a concrete result, not to generate a reusable, generic function.

The specification should always include the original objective and any relevant details from prior observations and actions.
Specifications must not contain requests for inputs or placeholders; instead, every necessary detail should be fully detailed within the specification.

The generated Javascript code will then be executed to yield a specific result, as per the provided specification.

Input format:
{{
  "action": "${ NAME }",
  "action_input": "original objective and detailed specification"
}}
`;

const SPECIFICATION_INPUT = "specification";
const ENVIRONMENT_INPUT = "environment";
const EXAMPLE_INPUT = "example";

export const GUIDANCE = `
You are an AI assistant receiving a detailed code specification. Your task is to translate this specification into executable JavaScript code, which should then be run in a secure code environment to produce a result.

This is the code specification:
{${SPECIFICATION_INPUT}}

Please consider the following when developing the code:
* The environment is an isolated Node.js setup with fetch() available for network requests.
   ...(Example using fetch: const response = await fetch('https://api.example.com/data');)
* You cannot require or import any new libraries and the code must not rely on environment variables.
* Aim to keep the code as simple and straightforward as possible, adhering to the specification.
* Your output should be executable code that returns a result as a string immediately upon execution.
* Always throw errors, never return them as strings.

You have access to these environment variables:
{${ENVIRONMENT_INPUT}}
To access these environment variables, use: \`process.env['ENVIRONMENT_VARIABLE_NAME']\`.

Here's an example of similar function you've developed in the past:
\`\`\`javascript
{${EXAMPLE_INPUT}}
\`\`\`

Now, based on the natural language description, your task is to generate JavaScript code for immediate evaluation and return.

Here's the required format for your response:
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

export interface CodeEvaluatorParams extends ToolParams {
    model: BaseLanguageModel;
    memory: MemoryStore;
}

export class CodeExecutor extends Tool {
    public readonly name = NAME;
    public readonly description = DESCRIPTION;

    private readonly llmChain: LLMChain;
    private readonly memory: MemoryStore;

    constructor({ model, memory, verbose, callbacks }: CodeEvaluatorParams) {
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
        // Filter environment variables starting with "VM_"
        const vmEnvironmentVariables = Object.entries(process.env)
        .filter(([key]) => key.startsWith("VM_"))
        .reduce((acc, [key, value]) => {
            const strippedKey = key.replace("VM_", ""); // Remove the prefix
            acc[strippedKey] = value;
            return acc;
        }, {});

        // Generate a string of the keys that start with "VM_"
        const vmEnvironmentKeys = Object.keys(vmEnvironmentVariables).join(", ");

        // Retrieve a similar example from memory.
        const memory = await this.memory.retrieve(specification, 1);
        const example = memory && memory.length > 0 ? memory[0].pageContent : "No example found.";

        // Generate JavaScript code from the natural language description.
        const completion = await this.llmChain.predict({
            [SPECIFICATION_INPUT]: specification,
            [ENVIRONMENT_INPUT]: vmEnvironmentKeys,
            [EXAMPLE_INPUT]: example
        });

        const regex = /(?<=```javascript)[\s\S]*?(?=\n```)/;
        const matches = completion.match(regex);
        const code = matches.pop();

        try {
            // Evaluate the generated JavaScript code.
            const output = vm.runInNewContext(code, {
                console,
                fetch,
                process: {
                    env: vmEnvironmentVariables
                }
            }, { timeout: 3000 });
            const result = await output;

            // store this program for future reference
            await this.memory.storeTexts([code],  {
                specification: specification
            })

            return result || "No results returned.";
        } catch (error) {
            // store this program for future reference
            await this.memory.storeTexts([`${code}\n\nThe prior code errored with this message: ${error.message}`],  {
                specification: specification
            })

            return JSON.stringify({ error: error.message });
        }
    }
}
