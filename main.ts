import { Client } from "https://deno.land/x/mysql/mod.ts";
import * as config from "./config.ts";
import * as emoji from "https://deno.land/x/emoji/mod.ts";
import { config as dotEnvConfig } from 'https://deno.land/x/dotenv@v1.0.1/mod.ts';
import * as fetcher from './app/fetcher.ts';

dotEnvConfig({ export: true });

const env = Deno.env.toObject();
const client = await new Client();

console.log('init');

client.connect({
  hostname: env.MYSQL_HOSTNAME,
  username: env.MYSQL_USERNAME,
  password: env.MYSQL_PASSWORD,
  db: env.MYSQL_DB,
});


await client.execute(`USE ${config.DATABASE}`);

const response = await fetch(config.art19endpoint + '/episodes/' + config.episode_id, {
  method: "GET",
  headers: {
    Accept:        "application/vnd.api+json",
    Authorization: 'Token token="'+config.art19token+'", credential="'+config.credential+'"'
  }
});

async function runFetchProcess(){
  console.log('start running');
  let shows = await fetcher.getAllShowFromDb();

  for (const show of shows) {
    let episodes = await fetcher.fetchAllEpisodes(config.art19endpoint, show.art19_id);
    fetcher.iterateOverEpisodes(episodes);
  }

  console.log('completed running');
  console.log(shows);
  return;
}

await runFetchProcess();