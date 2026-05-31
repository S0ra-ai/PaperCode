(function () {
  const pages = [
    ["index.html", "总览"],
    ["usage-guide.html", "使用入口"],
    ["development-guide.html", "开发指南"],
    ["development-workflow.html", "开发工作流"],
    ["architecture.html", "架构"],
    ["module-map.html", "模块地图"],
    ["function-reference.html", "关键函数索引"],
    ["paperrun-flow.html", "PaperRun 流程"],
    ["paper-generation.html", "论文生成链路"],
    ["experiment-execution.html", "实验执行链路"],
    ["preview-export.html", "Preview 与导出"],
    ["tui-models.html", "TUI 与模型"],
    ["agents-capabilities.html", "Agent / MCP / Skills"],
    ["testing-maintenance.html", "测试与维护"],
    ["developer-recipes.html", "修改手册"],
  ]

  const current = (window.location.pathname.split("/").pop() || "index.html").toLowerCase()
  const currentIndex = pages.findIndex(([href]) => href.toLowerCase() === current)
  const layout = document.querySelector(".layout")
  const content = document.querySelector("main.content")
  if (!layout || !content) return

  layout.classList.add("with-toc")

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
})()
