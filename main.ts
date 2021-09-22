import { Client } from "https://deno.land/x/mysql/mod.ts";
import * as config from "./config.ts";
import * as emoji from "https://deno.land/x/emoji/mod.ts";
import { config as dotEnvConfig } from 'https://deno.land/x/dotenv@v1.0.1/mod.ts';
import * as fetcher from './app/fetcher.ts';

await fetcher.runFetchProcess();