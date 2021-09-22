import * as fetcher from './app/fetcher.ts';

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "../runtime/mod.ts";

// deno-lint-ignore require-await
export async function handler(
  _event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> {

  await fetcher.runFetchProcess();

  return {
    statusCode: 200,
    headers: { "content-type": "text/html;charset=utf8" },
    body: `Executed D&N ART19 fetch process | deno ${Deno.version.deno} 🦕`,
  };
}
