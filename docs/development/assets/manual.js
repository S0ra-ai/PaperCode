(function () {
  const pages = [
    ["index.html", "总览", "readthedocs furo manual overview"],
    ["usage-guide.html", "使用入口", "tui models workspace preview export resume"],
    ["development-guide.html", "开发指南", "developer workflow state artifact tests"],
    ["development-workflow.html", "开发工作流", "git flow version changelog verification"],
    ["architecture.html", "架构", "system layers paper core preview research tools storage"],
    ["module-map.html", "模块地图", "directories packages paper tui preview research-tools"],
    ["function-reference.html", "关键函数索引", "createPaperRun orchestrator draft export routing"],
    ["api-contracts.html", "接口与数据契约", "http api payload events artifact schema snapshot export"],
    ["paperrun-flow.html", "PaperRun 流程", "stage graph events run storage diagnostics"],
    ["paper-generation.html", "论文生成链路", "draft claim ledger literature writing final paper"],
    ["experiment-execution.html", "实验执行链路", "gpu docker container baseline ablation terminal trace"],
    ["preview-export.html", "Preview 与导出", "sse monitor pdf docx manifest final gate"],
    ["tui-models.html", "TUI 与模型", "provider allowlist decision model stage policy"],
    ["agents-capabilities.html", "Agent / MCP / Skills", "agent team mcp skill capability bus"],
    ["testing-maintenance.html", "测试与维护", "strict acceptance browser smoke typecheck"],
    ["developer-recipes.html", "修改手册", "recipes add stage artifact tui preview model"],
  ]

  const current = (window.location.pathname.split("/").pop() || "index.html").toLowerCase()
  const currentIndex = pages.findIndex(([href]) => href.toLowerCase() === current)
  const layout = document.querySelector(".layout")
  const content = document.querySelector("main.content")
  if (!layout || !content) return

  layout.classList.add("with-toc")
  installToolbar()
  installSearch()
  installCodeCopy()

  if (!content.querySelector(".breadcrumbs")) {
    const title = pages[currentIndex]?.[1] || document.title.replace(" - Paper Fucker 开发手册", "")
    const breadcrumbs = document.createElement("div")
    breadcrumbs.className = "breadcrumbs"
    breadcrumbs.innerHTML = `<a href="./index.html">开发手册</a><span>${escapeHtml(title)}</span>`
    content.insertBefore(breadcrumbs, content.firstElementChild)
  }

  const headings = Array.from(content.querySelectorAll("h2, h3"))
    .filter((heading) => !heading.closest(".prev-next"))
    .filter((heading) => heading.textContent.trim().length > 0)

  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `section-${index + 1}`
    if (!heading.querySelector(".heading-anchor")) {
      const anchor = document.createElement("a")
      anchor.className = "heading-anchor"
      anchor.href = `#${heading.id}`
      anchor.setAttribute("aria-label", `链接到 ${heading.textContent.trim()}`)
      anchor.textContent = "#"
      heading.appendChild(anchor)
    }
  })

  if (!layout.querySelector(".page-toc")) {
    const pageToc = document.createElement("aside")
    pageToc.className = "page-toc"
    pageToc.innerHTML = "<strong>本页目录</strong>"
    headings.slice(0, 18).forEach((heading) => {
      const link = document.createElement("a")
      link.href = `#${heading.id}`
      link.textContent = heading.textContent.replace("#", "").trim()
      if (heading.tagName.toLowerCase() === "h3") link.className = "toc-h3"
      pageToc.appendChild(link)
    })
    layout.appendChild(pageToc)
  }

  if (!content.querySelector(".prev-next") && currentIndex >= 0) {
    const prev = pages[currentIndex - 1]
    const next = pages[currentIndex + 1]
    if (prev || next) {
      const nav = document.createElement("div")
      nav.className = "prev-next"
      nav.innerHTML = [
        prev
          ? `<a href="./${prev[0]}"><span>上一页</span>${escapeHtml(prev[1])}</a>`
          : `<span></span>`,
        next
          ? `<a href="./${next[0]}"><span>下一页</span>${escapeHtml(next[1])}</a>`
          : `<span></span>`,
      ].join("")
      content.appendChild(nav)
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  function installSearch() {
    const sidebar = layout.querySelector(".sidebar")
    const brand = sidebar?.querySelector(".brand")
    if (!sidebar || !brand || sidebar.querySelector(".doc-search")) return

    const wrapper = document.createElement("div")
    wrapper.className = "doc-search"
    wrapper.innerHTML = [
      '<label for="manual-search">文档搜索</label>',
      '<input id="manual-search" type="search" autocomplete="off" placeholder="搜索模块、函数、流程" />',
      '<div class="doc-search-results" hidden></div>',
    ].join("")
    brand.insertAdjacentElement("afterend", wrapper)

    const input = wrapper.querySelector("input")
    const results = wrapper.querySelector(".doc-search-results")
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase()
      if (!query) {
        results.hidden = true
        results.innerHTML = ""
        return
      }
      const matches = pages
        .filter(([, title, keywords]) => `${title} ${keywords}`.toLowerCase().includes(query))
        .slice(0, 8)
      results.innerHTML = matches.length
        ? matches.map(([href, title]) => `<a href="./${href}">${escapeHtml(title)}</a>`).join("")
        : '<span>未找到匹配页面</span>'
      results.hidden = false
    })

    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return
      const active = document.activeElement
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return
      event.preventDefault()
      input.focus()
    })
  }

  function installToolbar() {
    if (document.querySelector(".doc-toolbar")) return

    const title = pages[currentIndex]?.[1] || "开发手册"
    const sourceHref = `https://github.com/ZhuchenZhong/paper_fucker/blob/develop/docs/development/${encodeURIComponent(current)}`
    const toolbar = document.createElement("div")
    toolbar.className = "doc-toolbar"
    toolbar.innerHTML = [
      '<button type="button" data-action="nav">目录</button>',
      '<button type="button" data-action="wide">展开正文</button>',
      '<button type="button" data-action="theme">浅色</button>',
      `<a href="${sourceHref}" target="_blank" rel="noreferrer">查看本页源码</a>`,
      `<span>${escapeHtml(title)}</span>`,
    ].join("")
    document.body.insertBefore(toolbar, document.body.firstChild)

    const savedTheme = localStorage.getItem("paper-dev-doc-theme")
    if (savedTheme === "light") {
      document.body.classList.add("theme-light")
      toolbar.querySelector('[data-action="theme"]').textContent = "深色"
    }

    toolbar.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLButtonElement)) return
      const action = target.dataset.action
      if (action === "nav") {
        layout.classList.toggle("nav-hidden")
        target.textContent = layout.classList.contains("nav-hidden") ? "显示目录" : "目录"
      }
      if (action === "wide") {
        layout.classList.toggle("reading-wide")
        target.textContent = layout.classList.contains("reading-wide") ? "标准宽度" : "展开正文"
      }
      if (action === "theme") {
        const light = document.body.classList.toggle("theme-light")
        localStorage.setItem("paper-dev-doc-theme", light ? "light" : "dark")
        target.textContent = light ? "深色" : "浅色"
      }
    })
  }

  function installCodeCopy() {
    content.querySelectorAll("pre").forEach((pre, index) => {
      if (pre.parentElement?.classList.contains("code-block")) return
      const wrapper = document.createElement("div")
      wrapper.className = "code-block"
      pre.parentNode.insertBefore(wrapper, pre)
      wrapper.appendChild(pre)

      const button = document.createElement("button")
      button.type = "button"
      button.className = "copy-code"
      button.textContent = "复制"
      button.setAttribute("aria-label", `复制代码块 ${index + 1}`)
      wrapper.appendChild(button)

      button.addEventListener("click", async () => {
        const text = pre.textContent || ""
        try {
          await navigator.clipboard.writeText(text)
          button.textContent = "已复制"
          setTimeout(() => {
            button.textContent = "复制"
          }, 1200)
        } catch {
          button.textContent = "复制失败"
          setTimeout(() => {
            button.textContent = "复制"
          }, 1200)
        }
      })
    })
  }
})()
