import type {InterviewConfiguration, ResearchSource} from "@practice-room/shared-types"
import {buildResearchQueries, suppliedMaterialQueries} from "./research";
import type {SearchProvider} from "./search-provider";

export async function runPublicResearch(
    config: InterviewConfiguration,
    provider: SearchProvider,
): Promise<ResearchSource[]> {
    const notes = (config.materials ?? config.job?.materials ?? "").trim();
    if (notes) {
        const url = notes.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.;]+$/, "") ?? "supplied://notes";
        return [{
            platform: "supplied",
            title: "Notes you supplied",
            url,
            excerpt: notes.slice(0, 2000),
        }];
    }
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
