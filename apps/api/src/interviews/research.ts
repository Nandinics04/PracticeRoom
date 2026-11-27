import type {InterviewConfiguration, PublicPlatform, ResearchQuery, ResearchSource} from "@practice-room/shared-types"

const platformSites: Record<Exclude<PublicPlatform, "company_site" | "supplied">, string> = {
    leetcode: "leetcode.com",
    glassdoor: "glassdoor.com",
    geeksforgeeks: "geeksforgeeks.org",
    medium: "medium.com",
    reddit: "reddit.com",
    linkedin: "linkedin.com",
    AmbitionBox: "ambitionbox.com",
    ziprecruiter: "ziprecruiter.com",
    stackoverflow: "stackoverflow.com",
    github: "github.com",
    IGotAnOffer: "igotanoffer.com",
    Blind: "blind.com",
    CareerCup: "careercup.com",
};

export function suppliedMaterialQueries(materials: string | undefined): ResearchQuery[] {
    const text = materials?.trim() ?? "";
    if (!text) {
        return [];
    }
    const urls = [...text.matchAll(/https?:\/\/\S+/g)]
        .map((match) => match[0].replace(/[),.;]+$/, ""))
        .filter((url, index, all) => all.indexOf(url) === index)
        .slice(0, 3);
    const notes = text.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
    const queries: ResearchQuery[] = urls.map((url) => ({ platform: "supplied", query: url }));
    if (notes.length >= 24) {
        queries.push({ platform: "supplied", query: notes.slice(0, 2000) });
    }
    return queries;
}

export function buildResearchQueries(config: InterviewConfiguration): ResearchQuery[] {
    if(config.mode!="job"|| !config.job){
        return [];
    }
    const company=config.job.company.trim();
    const role=config.job.role.trim();
    const round=config.round ? ` ${config.round}`: "";
    const subject=`${company} ${role}${round} interview experience`;

    const siteQueries=(Object.keys(platformSites) as Array<keyof typeof platformSites>).map(
        (platform)=>({
            platform,
            query: `${subject} site:${platformSites[platform]}`
        }),
    );
    return [
        ...siteQueries,
        {
            platform: "company_site",
            query: `${company} official carrers engineering blog ${role} interview`,
        }
    ];
}

export function mockFetchPublicPages(queries: ResearchQuery[]): ResearchSource[] {
    return queries.map((item)=>({
        platform: item.platform,
        title: item.query,
        url: `https://example.com/${item.platform}`,
        excerpt: "Public page used as interview preparation for this company and role.",
    }))
}