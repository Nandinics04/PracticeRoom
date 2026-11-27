import type { ResearchQuery, ResearchSource} from "@practice-room/shared-types"
import { spawn } from "node:child_process";
import { join } from "node:path";

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

export class LocalSearchProvider implements SearchProvider {
    async search(): Promise<ResearchSource[]> {
        return [];
    }
}

export class McpSearchProvider implements SearchProvider {
    async search(query: ResearchQuery): Promise<ResearchSource[]> {
      const request = JSON.stringify({ platform: query.platform, query: query.query });
      const serviceDir = join(__dirname, "..", "..", "..", "ai-service");
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn("python", ["search_web.py"], { cwd: serviceDir });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(stderr || `search_web.py exited ${code}`));
        });
        child.stdin.write(request);
        child.stdin.end();
      });
      return [JSON.parse(output) as ResearchSource];
    }
  }