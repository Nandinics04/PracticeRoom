import type { ResearchQuery, ResearchSource} from "@practice-room/shared-types"

export interface SearchProvider{
    search(query: ResearchQuery): Promise<ResearchSource[]>;
}

export class MockSearchProvider implements SearchProvider{
    async search(query: ResearchQuery): Promise<ResearchSource[]>{
        return [
            {
                platform: query.platform,
                title: query.query,
                url: `https://example.com/${query.platform}`,
                excerpt: "Public page used as interview preparation for this company and role.",
            },
        ];
    }
}