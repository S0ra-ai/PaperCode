"""字数统计与验证工具"""
import re


def count_chinese_chars(text: str) -> int:
    """统计中文字符数（含中文标点）"""
    return len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', text))


def count_total_chars(text: str) -> int:
    """统计总字符数（去除空白和Markdown标记）"""
    clean = re.sub(r'\s+', '', text)
    clean = re.sub(r'[#*`\[\](){}|>-]', '', clean)
    return len(clean)


def validate_word_count(text: str, target: int, tolerance: float = 0.2) -> dict:
    """验证字数是否达标"""
    actual = count_chinese_chars(text)
    ratio = actual / target if target > 0 else 0
    return {
        "target": target,
        "actual": actual,
        "ratio": round(ratio, 2),
        "passed": ratio >= (1 - tolerance),
        "message": f"目标 {target} 字，实际 {actual} 字 ({ratio:.0%})",
    }


def allocate_section_words(total_target: int, section_count: int,
                           roles: list[str] | None = None) -> list[int]:
    """根据总目标字数和章节角色分配各章节字数。

    roles 为可选的角色列表，与章节一一对应。
    支持的角色: "introduction", "conclusion", "references", "body"。
    """
    if section_count <= 0:
        return []

    roles = roles or ["body"] * section_count
    # 参考文献固定500字
    ref_budget = sum(500 for r in roles if r == "references")
    remaining = max(total_target - ref_budget, 0)
    non_ref_roles = [r for r in roles if r != "references"]

    weights = []
    for r in non_ref_roles:
        if r == "introduction":
            weights.append(0.8)
        elif r == "conclusion":
            weights.append(0.7)
        else:
            weights.append(1.0)

    total_weight = sum(weights) or 1
    allocations = []
    role_idx = 0
    for r in roles:
        if r == "references":
            allocations.append(500)
        else:
            w = weights[role_idx]
            alloc = int(remaining * w / total_weight)
            allocations.append(max(alloc, 500))
            role_idx += 1

    return allocations
