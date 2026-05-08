#!/usr/bin/env node
/**
 * Fetch latest gambling disorder research papers from PubMed E-utilities API.
 * Deduplicates against already-summarized PMIDs stored in docs/summarized_pmids.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

const HEADERS = { "User-Agent": "GamblingDisorderBot/1.0 (research aggregator)" };
const TIMEOUT_MS = 30_000;

const CORE_TERMS = [
  '"gambling disorder"',
  '"pathological gambling"',
  '"problem gambling"',
  '"disordered gambling"',
  '"compulsive gambling"',
  '"gambling addiction"',
  '"gambling-related harm"',
  '"gambling harms"',
];

const EXPANDED_TERMS = [
  '"at-risk gambling"',
  '"excessive gambling"',
  '"behavioral addiction"',
  '"behavioural addiction"',
  '"sports betting"',
  '"online gambling"',
  '"internet gambling"',
  '"mobile gambling"',
  '"loot box"',
  '"esports betting"',
];

function buildQuery(days) {
  const now = new Date();
  const lookback = new Date(now.getTime() - days * 86_400_000);
  const fmt = (d) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const datePart = `"${fmt(lookback)}"[Date - Publication] : "3000"[Date - Publication]`;
  const meshPart = '"Gambling"[Mesh]';
  const termGroup = [...CORE_TERMS, ...EXPANDED_TERMS].map((t) => `${t}[tiab]`).join(" OR ");
  return `(${meshPart} OR ${termGroup}) AND ${datePart}`;
}

async function searchPapers(query, retmax) {
  const url = new URL(PUBMED_SEARCH);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("term", query);
  url.searchParams.set("retmax", String(retmax));
  url.searchParams.set("sort", "date");
  url.searchParams.set("retmode", "json");
  try {
    const resp = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`PubMed search HTTP ${resp.status}`);
    const data = await resp.json();
    return data?.esearchresult?.idlist ?? [];
  } catch (err) {
    console.error(`[ERROR] PubMed search failed: ${err.message}`);
    return [];
  }
}

async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const url = new URL(PUBMED_FETCH);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", pmids.join(","));
  url.searchParams.set("retmode", "xml");
  try {
    const resp = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) throw new Error(`PubMed fetch HTTP ${resp.status}`);
    const xml = await resp.text();
    return parsePubMedXml(xml);
  } catch (err) {
    console.error(`[ERROR] PubMed fetch failed: ${err.message}`);
    return [];
  }
}

function parsePubMedXml(xml) {
  const papers = [];
  const articles = xml.split(/<PubmedArticle>/);
  for (let i = 1; i < articles.length; i++) {
    const chunk = articles[i];
    try {
      const pmid = extractTag(chunk, "PMID");
      const title = extractTag(chunk, "ArticleTitle");
      const journal = extractTag(chunk, "<Title>");
      if (!title) continue;

      const abstractParts = [];
      const absRegex = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
      let m;
      while ((m = absRegex.exec(chunk)) !== null) {
        const labelMatch = m[0].match(/Label="([^"]*)"/);
        const label = labelMatch ? labelMatch[1] : "";
        const text = m[1].replace(/<[^>]+>/g, "").trim();
        if (text) abstractParts.push(label ? `${label}: ${text}` : text);
      }
      const abstract = abstractParts.join(" ").slice(0, 2000);

      const year = extractTag(chunk, "<Year>");
      const month = extractTag(chunk, "<Month>");
      const day = extractTag(chunk, "<Day>");
      const dateStr = [year, month, day].filter(Boolean).join(" ");

      const keywords = [];
      const kwRegex = /<Keyword>([\s\S]*?)<\/Keyword>/g;
      while ((m = kwRegex.exec(chunk)) !== null) {
        const kw = m[1].trim();
        if (kw) keywords.push(kw);
      }

      const link = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";

      papers.push({ pmid, title, journal, date: dateStr, abstract, url: link, keywords });
    } catch {
      continue;
    }
  }
  return papers;
}

function extractTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}>([\\s\\S]*?)<\\/`, "m");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

async function loadSummarizedPmids() {
  const path = new URL("../docs/summarized_pmids.json", import.meta.url);
  if (!existsSync(path)) return new Set();
  try {
    const raw = await readFile(path, "utf-8");
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function saveSummarizedPmids(pmids) {
  const path = new URL("../docs/summarized_pmids.json", import.meta.url);
  await writeFile(path, JSON.stringify([...pmids].sort(), null, 2), "utf-8");
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      days: { type: "string", default: "7" },
      "max-papers": { type: "string", default: "40" },
      output: { type: "string", default: "papers.json" },
    },
    strict: true,
  });
  return {
    days: Math.max(1, parseInt(values.days, 10) || 7),
    maxPapers: Math.min(100, Math.max(1, parseInt(values["max-papers"], 10) || 40)),
    output: values.output,
  };
}

async function main() {
  const { days, maxPapers, output } = parseCli();

  const query = buildQuery(days);
  console.error(`[INFO] Searching PubMed for gambling disorder papers (last ${days} days)...`);

  const pmids = await searchPapers(query, maxPapers);
  console.error(`[INFO] Found ${pmids.length} PMIDs`);

  if (!pmids.length) {
    const empty = { date: taipeiDate(), count: 0, papers: [] };
    await writeFile(output, JSON.stringify(empty, null, 2), "utf-8");
    console.error("[WARN] No papers found");
    return;
  }

  const summarized = await loadSummarizedPmids();
  const newPmids = pmids.filter((id) => !summarized.has(id));
  console.error(`[INFO] After dedup: ${newPmids.length} new papers (skipped ${pmids.length - newPmids.length} already summarized)`);

  if (!newPmids.length) {
    const empty = { date: taipeiDate(), count: 0, papers: [], skipped: pmids.length };
    await writeFile(output, JSON.stringify(empty, null, 2), "utf-8");
    console.error("[INFO] All papers already summarized");
    return;
  }

  const papers = await fetchDetails(newPmids);
  console.error(`[INFO] Fetched details for ${papers.length} papers`);

  const result = { date: taipeiDate(), count: papers.length, papers };
  await writeFile(output, JSON.stringify(result, null, 2), "utf-8");
  console.error(`[INFO] Saved to ${output}`);
}

function taipeiDate() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
