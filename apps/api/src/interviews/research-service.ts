import type {InterviewConfiguration, ResearchSource} from "@practice-room/shared-types"
import {buildResearchQueries} from "./research.ts";
import type {SearchProvider} from "./search-provider.ts";

export async function runPublicResearch(
    config: InterviewConfiguration,
    provider: SearchProvider,
): Promise<ResearchSource[]> {
    const queries=buildResearchQueries(config);
    const results=await Promise.allSettled(queries.map(async (query)=>provider.search(query)));

    const seen= new Set<string>();
    const sources: ResearchSource[]=[];

    for(const result of results){
        if(result.status!=="fulfilled") continue;
        for(const source of result.value){
            if(seen.has(source.url)) continue;
            seen.add(source.url);
            sources.push(source);
        }
    }
    return sources; 
}
