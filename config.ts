import { config as dotEnvConfig } from 'https://deno.land/x/dotenv@v1.0.1/mod.ts';
const env = Deno.env.toObject();

export const DATABASE: string = "dn_milestones";

export const art19endpoint = 'https://art19.com/';
export const art19token = env.ART19_TOKEN;
export const credential = env.ART19_CREDENTIAL;
export const episode_id = env.ART19_EPISODE_ID;
export const update_interval_hours = env.UPDATE_INTERVAL_HOURS;
export const current_show_id = 1;