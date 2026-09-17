import{_ as a,o as n,c as e,ag as p}from"./chunks/framework.CAfGEm1x.js";const h=JSON.parse('{"title":"Command reference","description":"","frontmatter":{},"headers":[],"relativePath":"reference/cli.md","filePath":"reference/cli.md"}'),l={name:"reference/cli.md"};function t(o,s,i,c,d,r){return n(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="command-reference" tabindex="-1">Command reference <a class="header-anchor" href="#command-reference" aria-label="Permalink to &quot;Command reference&quot;">​</a></h1><p>Generated from the current Commander command definitions. Your installed version may differ; run <code>kundol --help</code> to check it.</p><h2 id="kundol" tabindex="-1">kundol <a class="header-anchor" href="#kundol" aria-label="Permalink to &quot;kundol&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol [options] [command]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Optimise developer storage and project build artifacts with an audited</span></span>
<span class="line"><span>scan-confirm-clean flow.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -V, --version  output the version number</span></span>
<span class="line"><span>  -h, --help     display help for command</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Commands:</span></span>
<span class="line"><span>  optimise       Scan, confirm, and clean storage or project targets.</span></span>
<span class="line"><span>  tools          Browse the optimisation catalogue and request new targets.</span></span>
<span class="line"><span>  issue          Open GitHub&#39;s issue chooser to file a bug or feature request.</span></span></code></pre></div><h2 id="kundol-optimise" tabindex="-1">kundol optimise <a class="header-anchor" href="#kundol-optimise" aria-label="Permalink to &quot;kundol optimise&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol optimise [options] [command]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Scan, confirm, and clean storage or project targets.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -h, --help                    display help for command</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Commands:</span></span>
<span class="line"><span>  all [options]                 Create one review plan across every explicitly</span></span>
<span class="line"><span>                                supplied optimisation scope.</span></span>
<span class="line"><span>  storage [options]             Review and run published owner-tool storage</span></span>
<span class="line"><span>                                cache rules.</span></span>
<span class="line"><span>  projects [options] &lt;workdir&gt;  Clean project-local dependency folders and</span></span>
<span class="line"><span>                                generated build output.</span></span>
<span class="line"><span>  docker [options] &lt;context&gt;    Review published resources in one explicitly</span></span>
<span class="line"><span>                                selected Docker context.</span></span>
<span class="line"><span>  repos [options] &lt;workdir&gt;     Clean generated targets under a supplied</span></span>
<span class="line"><span>                                workdir.</span></span></code></pre></div><h2 id="kundol-optimise-all" tabindex="-1">kundol optimise all <a class="header-anchor" href="#kundol-optimise-all" aria-label="Permalink to &quot;kundol optimise all&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol optimise all [options]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Create one review plan across every explicitly supplied optimisation scope.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  --workdir &lt;path&gt;         workspace directory for project and repository rules</span></span>
<span class="line"><span>  --docker-context &lt;name&gt;  named Docker context to pin for Docker rules</span></span>
<span class="line"><span>  -f, --force              skip confirmation and select only safe targets</span></span>
<span class="line"><span>                           (default: false)</span></span>
<span class="line"><span>  --allow-beta             attempt beta rules in every scope and report</span></span>
<span class="line"><span>                           unavailable handlers (default: false)</span></span>
<span class="line"><span>  -h, --help               display help for command</span></span></code></pre></div><h2 id="kundol-optimise-storage" tabindex="-1">kundol optimise storage <a class="header-anchor" href="#kundol-optimise-storage" aria-label="Permalink to &quot;kundol optimise storage&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol optimise storage [options]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Review and run published owner-tool storage cache rules.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -f, --force   skip confirmation after scanning (default: false)</span></span>
<span class="line"><span>  --allow-beta  include code-approved beta owner-tool rules (default: false)</span></span>
<span class="line"><span>  -h, --help    display help for command</span></span></code></pre></div><h2 id="kundol-optimise-projects" tabindex="-1">kundol optimise projects <a class="header-anchor" href="#kundol-optimise-projects" aria-label="Permalink to &quot;kundol optimise projects&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol optimise projects [options] &lt;workdir&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Clean project-local dependency folders and generated build output.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Arguments:</span></span>
<span class="line"><span>  workdir       workspace directory to scan</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -f, --force   skip confirmation after scanning (default: false)</span></span>
<span class="line"><span>  --allow-beta  include code-approved beta project rules (default: false)</span></span>
<span class="line"><span>  -h, --help    display help for command</span></span></code></pre></div><h2 id="kundol-optimise-docker" tabindex="-1">kundol optimise docker <a class="header-anchor" href="#kundol-optimise-docker" aria-label="Permalink to &quot;kundol optimise docker&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol optimise docker [options] &lt;context&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Review published resources in one explicitly selected Docker context.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Arguments:</span></span>
<span class="line"><span>  context       named Docker context to scan</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  --allow-beta  include code-approved beta protected inventories (default:</span></span>
<span class="line"><span>                false)</span></span>
<span class="line"><span>  -h, --help    display help for command</span></span></code></pre></div><h2 id="kundol-optimise-repos" tabindex="-1">kundol optimise repos <a class="header-anchor" href="#kundol-optimise-repos" aria-label="Permalink to &quot;kundol optimise repos&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol optimise repos [options] &lt;workdir&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Clean generated targets under a supplied workdir.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Arguments:</span></span>
<span class="line"><span>  workdir       workspace directory to scan</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -f, --force   skip confirmation after scanning (default: false)</span></span>
<span class="line"><span>  --allow-beta  include code-approved beta project rules (default: false)</span></span>
<span class="line"><span>  -h, --help    display help for command</span></span></code></pre></div><h2 id="kundol-tools" tabindex="-1">kundol tools <a class="header-anchor" href="#kundol-tools" aria-label="Permalink to &quot;kundol tools&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol tools [options] [command]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Browse the optimisation catalogue and request new targets.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -h, --help      display help for command</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Commands:</span></span>
<span class="line"><span>  available       List published optimisation tools.</span></span>
<span class="line"><span>  search &lt;query&gt;  Search published optimisation tools.</span></span>
<span class="line"><span>  list [options]  List catalogue rules at any delivery status.</span></span>
<span class="line"><span>  request         Open a prefilled GitHub Markdown issue for a missing tool.</span></span>
<span class="line"><span>  help [command]  display help for command</span></span></code></pre></div><h2 id="kundol-tools-available" tabindex="-1">kundol tools available <a class="header-anchor" href="#kundol-tools-available" aria-label="Permalink to &quot;kundol tools available&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol tools available [options]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>List published optimisation tools.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -h, --help  display help for command</span></span></code></pre></div><h2 id="kundol-tools-search" tabindex="-1">kundol tools search <a class="header-anchor" href="#kundol-tools-search" aria-label="Permalink to &quot;kundol tools search&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol tools search [options] &lt;query&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Search published optimisation tools.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Arguments:</span></span>
<span class="line"><span>  query       words to find in IDs, labels, descriptions, or categories</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -h, --help  display help for command</span></span></code></pre></div><h2 id="kundol-tools-list" tabindex="-1">kundol tools list <a class="header-anchor" href="#kundol-tools-list" aria-label="Permalink to &quot;kundol tools list&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol tools list [options]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>List catalogue rules at any delivery status.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -s, --status &lt;status&gt;  all, proposed, wip, beta, or published (choices: &quot;all&quot;,</span></span>
<span class="line"><span>                         &quot;proposed&quot;, &quot;wip&quot;, &quot;beta&quot;, &quot;published&quot;, default: &quot;all&quot;)</span></span>
<span class="line"><span>  -h, --help             display help for command</span></span></code></pre></div><h2 id="kundol-tools-request" tabindex="-1">kundol tools request <a class="header-anchor" href="#kundol-tools-request" aria-label="Permalink to &quot;kundol tools request&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol tools request [options]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Open a prefilled GitHub Markdown issue for a missing tool.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -h, --help  display help for command</span></span></code></pre></div><h2 id="kundol-issue" tabindex="-1">kundol issue <a class="header-anchor" href="#kundol-issue" aria-label="Permalink to &quot;kundol issue&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage: kundol issue [options]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Open GitHub&#39;s issue chooser to file a bug or feature request.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Options:</span></span>
<span class="line"><span>  -h, --help  display help for command</span></span></code></pre></div>`,28)])])}const m=a(l,[["render",t]]);export{h as __pageData,m as default};
