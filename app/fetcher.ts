import { Client } from "https://deno.land/x/mysql@v2.10.2/mod.ts";
import * as config from "../config.ts";
import * as helpers from "./helpers.ts";
import { config as dotEnvConfig } from 'https://deno.land/x/dotenv@v1.0.1/mod.ts';

dotEnvConfig({ export: true, path: './.env'});

const env = Deno.env.toObject();
const client = await new Client();

let art19reqcounter = 0;

client.connect({
  hostname: env.MYSQL_HOSTNAME,
  username: env.MYSQL_USERNAME,
  password: env.MYSQL_PASSWORD,
  db: env.MYSQL_DB,
});

await client.execute(`USE ${config.DATABASE}`);

export async function getAllShowFromDb(){
    const shows = await client.query(
        `SELECT * FROM shows WHERE active = '1' AND (updated_at <= DATE_SUB(NOW(), INTERVAL ${env.UPDATE_INTERVAL_HOURS} HOUR) OR updated_at IS NULL) LIMIT 5;`
    );
    return shows;
}

export async function fetchART19(url: string, absolute_url?: string)
{
  art19reqcounter++;

  let requestUri = config.art19endpoint + url;

  if (absolute_url) {
    requestUri = absolute_url;
  }

  //console.log(requestUri); // Enabled to log all requests to ART19
  //console.log('Num req: ' + art19reqcounter); // Show amount of requests done


  const response = await fetch(requestUri, {
    method: "GET",
    headers: {
      Accept:        "application/vnd.api+json",
      Authorization: 'Token token="'+env.ART19_TOKEN+'", credential="'+env.ART19_CREDENTIAL+'"'
    }
  });

  return response;
}

export async function fetchEpisode(art19endpoint: string, episode_id: string){
    const response = await fetchART19('episodes/' + episode_id);

    // return episode item
    const data = await response.json();
    return data;
  }

export async function fetchEpisodeLinksPage(originUrl: string)
{
  const currentResponse = await fetchART19('', originUrl);

  const data = await currentResponse.json();

  return data;
}

export async function* episodeIterator(episodesObj: any)
{
  if (!episodesObj.links.next) {
    return;
  }

  while (true) {
    const { data, links } = await fetchEpisodeLinksPage(episodesObj.links.next);
    if (!data) {
      break;
    }

    episodesObj.data = data;
    episodesObj.links = links;

    for (const item of data) {
      yield item;
    }

    // Stop looping if current page is last
    if (links.self === links.last) {
      break;
    }
  }
}

export async function fetchAllEpisodes(art19endpoint: string, series_id: string){
    // fetch show
    const response = await fetchART19('series/' + series_id);

    // return array of episodes
    const data = await response.json();
    const allEps = data.data.relationships.episodes.data; // Start with the first page of results

    for await (const ep of episodeIterator(data.data.relationships.episodes)) {
      allEps.push(ep);
    }
    console.log(`Fetched ${allEps.length} episodes for ${series_id}`)

    return allEps;
  }

export async function insertEpisodeIntoDb(show_id: number, episode: any) {
    // select db
    await client.execute(`USE ${config.DATABASE}`);

      let title = helpers.sanitizeString(episode.attributes.title); // strip quotes
      const listen_count = parseInt(episode.attributes.listen_count);

      // upsert into episodes table

      return await client.execute(`
      INSERT INTO episodes (show_id, art19_id, title, listen_count) VALUES ('${show_id}','${episode.id}','${title}','${episode.attributes.listen_count}')
      ON DUPLICATE KEY UPDATE listen_count = ${episode.attributes.listen_count};
    `);

  };

export async function updateShowListenCount(show_id: number, total_listen_count: number) {
    // select db
    await client.execute(`USE ${config.DATABASE}`);
    // insert into episodes table
    await client.execute(`
      UPDATE shows SET total_listen_count =  '${total_listen_count}', updated_at = NOW() WHERE id = '${show_id}';
    `);
  };

export async function insertMeasurementIntoDb(measurement: any) {
    // select db
    await client.execute(`USE ${config.DATABASE}`);
    // insert into episodes table
    let dbInsert = await client.execute(`
      INSERT INTO measurements (show_id, episode_id, type, count, date)
      VALUES ('${measurement.show_id}','${measurement.episode_id}','${measurement.type}',${measurement.count}, NOW())
      ON DUPLICATE KEY UPDATE count = ${measurement.count};
    `);
  };


export async function calculateIncrement(measurement: any) {
    const lastMeasurements = await client.query(
      `SELECT * FROM measurements WHERE show_id = '${measurement.show_id}' AND episode_id = '${measurement.episode_id}' AND type = 'listen_count' ORDER BY date DESC LIMIT 2;`
    );

    // no two measurements found, stop calculating increment
    if (lastMeasurements.length < 2){
      return;
    }

    const measurement_a = lastMeasurements[1];
    const measurement_b = lastMeasurements[0];

    const seconds_between = secondsBetweenDates(measurement_a.date, measurement_b.date);

    const increment_value = measurement_b.count - measurement_a.count;

      await client.execute(`
      INSERT INTO increments (show_id, episode_id, previous_measurement_id, current_measurement_id, seconds_between, value, date)
      VALUES ('${measurement.show_id}','${measurement.episode_id}','${measurement_a.id}','${measurement_b.id}','${seconds_between}','${increment_value}', NOW())
      ON DUPLICATE KEY UPDATE value = ${increment_value}, date = NOW();
    `);
  };

export async function calculateShowDailyIncrement(show_id: number) {
    const dailyIncrease = await client.query(
      `SELECT SUM(value) as sum FROM increments WHERE show_id = '${show_id}' AND DATE(date) = DATE(NOW());`
    );

    if(!dailyIncrease[0].sum){
      return false;
    }

    const measurement = {
      show_id: show_id,
      type: "show_listen_count_daily_increase",
      count: dailyIncrease[0].sum
    }

      await client.execute(`
      INSERT INTO aggregates (show_id, type, count, date)
      VALUES ('${measurement.show_id}','${measurement.type}','${measurement.count}', NOW())
      ON DUPLICATE KEY UPDATE count = ${measurement.count};
    `);
  };

export async function markMilestoneAsReach(show_milestone: any)
  {
    // insert into episodes table
    await client.execute(`
    UPDATE milestones SET reached_at = NOW() WHERE id = '${show_milestone.milestone_id}';
    `);
  }

export async function calculateMilestones(){
    const milestonesReached = await client.query(
      `SELECT a.id as milestone_id, b.id as show_id, a.value, a.created_at FROM milestones a LEFT JOIN shows b ON a.show_id = b.id WHERE a.type = 'total_listen_count' AND b.total_listen_count >= a.value AND a.reached_at = '0000-00-00'`
    );
    // mark milestones as reached
  //   milestonesReached.forEach((show_milestone: any) => {
  //     markMilestoneAsReach(show_milestone)
  // });

    for (const show_milestone of milestonesReached) {
      markMilestoneAsReach(show_milestone);
    }
  }

export async function getEpisodeFromDb(art19_id: string){
    const episode = await client.query(
      `SELECT * FROM episodes WHERE art19_id = '${art19_id}';`
    );
    return episode[0];
  }

export async function getShowFromDb(art19_id: string){
    const show = await client.query(
      `SELECT * FROM shows WHERE art19_id = '${art19_id}';`
    );
    return show[0];
  }

export function secondsBetweenDates(date1: string, date2: string){
    const t1 = new Date(date1);
    const t2 = new Date(date2);
    const dif = t1.getTime() - t2.getTime();

    const Seconds_from_T1_to_T2 = dif / 1000;
    const Seconds_Between_Dates = Math.abs(Seconds_from_T1_to_T2);

    return Seconds_Between_Dates;
  }

export async function iterateOverEpisodes(episodes: any) {
    let episodesProcessed = 0;
    let show_total_listen_count = 0;

    for (const episode of episodes){
      const data = await fetchEpisode(config.art19endpoint, episode.id);
      if (typeof(data.data) == 'undefined'){
        continue;
      }

      let dbShow = await getShowFromDb(data.data.attributes.series_id);
      let measurement = {
        show_id: null,
        episode_id: null,
        art19_show_id: data.data.attributes.series_id,
        art19_episode_id: data.id,
        type: 'listen_count',
        count: data.data.attributes.listen_count,
      };

      // sum listen count
      show_total_listen_count += data.data.attributes.listen_count;
      await insertEpisodeIntoDb(dbShow.id, data.data).then(async function() {
        let dbEpisode = await getEpisodeFromDb(data.data.id);
        let dbShow = await getShowFromDb(data.data.attributes.series_id);
        measurement.episode_id = dbEpisode.id;
        measurement.show_id = dbShow.id;
        insertMeasurementIntoDb(measurement);
        calculateIncrement(measurement);
      });

      episodesProcessed++;

      if(episodes.length == episodesProcessed){
        console.log(`All episodes processed for ${dbShow.title} (${dbShow.art19_id})`);
        await updateShowListenCount(dbShow.id, show_total_listen_count)
        await calculateMilestones();
        await calculateShowDailyIncrement(dbShow.id);

        return true;
      }
    }
  }

export async function runFetchProcess(){
  console.log('Start fetch program..');
  let shows = await getAllShowFromDb();

  for (const show of shows) {
    console.log(`Processing ${show.title} (${show.art19_id})`)
    let episodes = await fetchAllEpisodes(config.art19endpoint, show.art19_id);
    await iterateOverEpisodes(episodes);
  }

  console.log('Completed fetch program..');
  return;
}