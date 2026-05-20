import argparse
import csv
import json
import random
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    unit: str
    applicable_unit_types: tuple[str, ...]
    keywords: tuple[str, ...]
    domain: str = "v_trans_all"


RID4_PROVINCES = ("กำแพงเพชร", "แพร่", "ตาก", "สุโขทัย")

METRICS: list[Metric] = [
    # Reservoir (อ่าง/เขื่อน)
    Metric(
        key="qstore_curr",
        label="ปริมาณน้ำเก็บกักวันนี้",
        unit="ล้าน ลบ.ม.",
        applicable_unit_types=("อ่างเก็บน้ำ", "อ่างขนาดเล็ก"),
        keywords=("อ่างเก็บน้ำ", "ปริมาณน้ำเก็บกัก"),
    ),
    Metric(
        key="qusage_curr",
        label="ปริมาณน้ำใช้การวันนี้",
        unit="ล้าน ลบ.ม.",
        applicable_unit_types=("อ่างเก็บน้ำ", "อ่างขนาดเล็ก"),
        keywords=("อ่างเก็บน้ำ", "ปริมาณน้ำใช้การ"),
    ),
    Metric(
        key="ulevel_curr",
        label="ระดับน้ำวันนี้",
        unit="ม.",
        applicable_unit_types=("อ่างเก็บน้ำ", "อ่างขนาดเล็ก"),
        keywords=("อ่างเก็บน้ำ", "ระดับน้ำ"),
    ),
    Metric(
        key="percent_qstore_curr",
        label="ร้อยละปริมาณน้ำเก็บกักวันนี้",
        unit="%",
        applicable_unit_types=("อ่างเก็บน้ำ", "อ่างขนาดเล็ก"),
        keywords=("อ่างเก็บน้ำ", "ร้อยละ"),
    ),
    Metric(
        key="inflow_curr",
        label="ปริมาณน้ำไหลเข้าวันนี้",
        unit="ล้าน ลบ.ม.",
        applicable_unit_types=("อ่างเก็บน้ำ", "อ่างขนาดเล็ก"),
        keywords=("อ่างเก็บน้ำ", "ไหลเข้า"),
    ),
    Metric(
        key="outflow_curr",
        label="ปริมาณน้ำระบายวันนี้",
        unit="ล้าน ลบ.ม.",
        applicable_unit_types=("อ่างเก็บน้ำ", "อ่างขนาดเล็ก"),
        keywords=("อ่างเก็บน้ำ", "ระบาย"),
    ),
    # Hydrology station (สถานีวัดน้ำ)
    Metric(
        key="water_level",
        label="ระดับน้ำล่าสุด",
        unit="ม.",
        applicable_unit_types=("สถานีวัดน้ำ",),
        keywords=("สถานีวัดน้ำ", "ระดับน้ำ"),
    ),
    Metric(
        key="water_accel",
        label="อัตราการไหล/ปริมาณน้ำผ่านล่าสุด",
        unit="ลบ.ม./วินาที",
        applicable_unit_types=("สถานีวัดน้ำ",),
        keywords=("สถานีวัดน้ำ", "ปริมาณน้ำผ่าน"),
    ),
    Metric(
        key="rain_sum_now",
        label="ปริมาณฝนสะสมวันนี้",
        unit="มม.",
        applicable_unit_types=("สถานีวัดน้ำ",),
        keywords=("ฝนสะสม", "มม."),
    ),
    Metric(
        key="water_level_warning",
        label="ระดับน้ำแจ้งเตือน",
        unit="ม.",
        applicable_unit_types=("สถานีวัดน้ำ",),
        keywords=("สถานีวัดน้ำ", "แจ้งเตือน", "ระดับน้ำ"),
    ),
    Metric(
        key="water_level_critical",
        label="ระดับน้ำวิกฤต",
        unit="ม.",
        applicable_unit_types=("สถานีวัดน้ำ",),
        keywords=("สถานีวัดน้ำ", "วิกฤต", "ระดับน้ำ"),
    ),
]

SIMSAT_DIMENSIONS = {"start_date", "end_date", "farmplot_batch_id", "plot_name", "coords"}


def normalize_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def parse_iso_date(s: str) -> date | None:
    s = normalize_space(s)
    if not s:
        return None
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def extract_unit_from_description(desc: str) -> tuple[str, str]:
    """
    Return (label_without_unit, unit).
    Unit pattern: something in parentheses, e.g. "พื้นที่ข้าว (ไร่)" or "... (ลบ.ม./วินาที) - ..."
    """
    d = normalize_space(desc)
    m = re.search(r"\(([^()]{1,40})\)", d)
    if not m:
        return d, ""
    unit = normalize_space(m.group(1))
    label = normalize_space((d[: m.start()] + d[m.end() :]).strip(" -–—"))
    return label, unit


def infer_keywords_from_label(label: str, unit: str) -> tuple[str, ...]:
    kw = set()
    l = label
    # entity/context keywords
    if any(w in l for w in ("แปลง", "พื้นที่", "โครงการ")):
        kw.add("แปลง")
    if "น้ำ" in l or "ใช้น้ำ" in l:
        kw.add("น้ำ")
    if "พยากรณ์" in l or "ข้างหน้า" in l:
        kw.add("พยากรณ์")
    if "พื้นที่" in l:
        kw.add("พื้นที่")
    # make unit itself required when it is distinctive
    if unit in ("ไร่", "%", "ลบ.ม./วินาที"):
        kw.add(unit)
    # keep a short strong phrase from the label
    # e.g. "ปริมาณการใช้น้ำรวม 4 ประเภททั้งหมด" -> include "ปริมาณการใช้น้ำ"
    if "ปริมาณ" in l and "น้ำ" in l:
        kw.add("ปริมาณ")
    return tuple(k for k in kw if k)


def load_simsat_metrics(dict_csv_path: Path) -> list[Metric]:
    with dict_csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        metrics: list[Metric] = []
        for row in reader:
            col = normalize_space(row.get("column_name", ""))
            dtype = normalize_space(row.get("data_type", ""))
            desc = normalize_space(row.get("description", ""))
            if not col or col in SIMSAT_DIMENSIONS:
                continue
            # keep numeric-like measures only
            if not re.search(r"(int|float|numeric|double|decimal)", dtype, re.I):
                continue
            label, unit = extract_unit_from_description(desc)
            # Some descriptions have the unit later after dash; if missing, infer by suffix
            if not unit:
                if col.endswith("_rai"):
                    unit = "ไร่"
                elif col.endswith("_pct") or "percent" in col:
                    unit = "%"
            keywords = infer_keywords_from_label(label, unit)
            # applicable_unit_types unused in simsat; keep permissive
            metrics.append(
                Metric(
                    key=col,
                    label=label or col,
                    unit=unit or "",
                    applicable_unit_types=("",),
                    keywords=keywords,
                    domain="simsat",
                )
            )
    # Prefer metrics that have a unit
    metrics.sort(key=lambda m: (m.unit == "", m.key))
    return metrics


def load_simsat_entities(sample_csv_path: Path) -> list[dict]:
    with sample_csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows: list[dict] = []
        for row in reader:
            plot_name = normalize_space(row.get("plot_name", ""))
            farmplot_batch_id = normalize_space(row.get("farmplot_batch_id", ""))
            start_date = normalize_space(row.get("start_date", ""))
            end_date = normalize_space(row.get("end_date", ""))
            if not plot_name:
                continue
            rows.append(
                {
                    "plot_name": plot_name,
                    "farmplot_batch_id": farmplot_batch_id,
                    "start_date": start_date,
                    "end_date": end_date,
                }
            )
    # dedupe by plot_name + date window
    seen = set()
    deduped = []
    for r in rows:
        k = (r["plot_name"], r["start_date"], r["end_date"])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(r)

    # group by plot_name and create "สัปดาห์ล่าสุด/สัปดาห์ก่อน"
    by_plot: dict[str, list[dict]] = {}
    for r in deduped:
        sd = parse_iso_date(r["start_date"])
        if not sd:
            continue
        by_plot.setdefault(r["plot_name"], []).append({**r, "_sd": sd})

    out: list[dict] = []
    for plot, lst in by_plot.items():
        lst.sort(key=lambda x: x["_sd"])
        latest = lst[-1]
        out.append(
            {
                "plot_name": plot,
                "farmplot_batch_id": latest.get("farmplot_batch_id", ""),
                "start_date": latest.get("start_date", ""),
                "end_date": latest.get("end_date", ""),
                "time_label": "สัปดาห์ล่าสุด",
            }
        )
        if len(lst) >= 2:
            prev = lst[-2]
            out.append(
                {
                    "plot_name": plot,
                    "farmplot_batch_id": prev.get("farmplot_batch_id", ""),
                    "start_date": prev.get("start_date", ""),
                    "end_date": prev.get("end_date", ""),
                    "time_label": "สัปดาห์ก่อน",
                    "next_start_date": latest.get("start_date", ""),
                    "next_end_date": latest.get("end_date", ""),
                }
            )
    return out


def load_units(csv_path: Path) -> list[dict]:
    # Supports 2 formats:
    # 1) Proper header: unit_type,unit_code,unit_name,province,district,subdistrict,department
    # 2) Generic header: Column1..Column7 with the *first data row* containing the real names
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        units: list[dict] = []
        # Detect "Column1..Column7" case. If so, rebuild reader using the second row as header.
        if reader.fieldnames and all((fn or "").startswith("Column") for fn in reader.fieldnames):
            raw_rows = list(reader)
            if not raw_rows:
                return []
            header_row = raw_rows[0]
            real_headers = [normalize_space(header_row.get(fn, "")) for fn in reader.fieldnames]
            idx = {reader.fieldnames[i]: (real_headers[i] or reader.fieldnames[i]) for i in range(len(reader.fieldnames))}
            # remap remaining rows into dict with real headers
            remapped = []
            for r in raw_rows[1:]:
                rr = {}
                for k, v in r.items():
                    rr[idx.get(k, k)] = v
                remapped.append(rr)
            rows_iter = remapped
        else:
            rows_iter = reader
        for row in rows_iter:
            unit_type = normalize_space(row.get("unit_type", ""))
            unit_code = normalize_space(row.get("unit_code", ""))
            unit_name = normalize_space(row.get("unit_name", "")) or unit_code
            province = normalize_space(row.get("province", ""))
            district = normalize_space(row.get("district", ""))
            subdistrict = normalize_space(row.get("subdistrict", ""))
            department = normalize_space(row.get("department", ""))
            if not unit_name and not unit_code:
                continue
            units.append(
                {
                    "unit_type": unit_type,
                    "unit_code": unit_code,
                    "unit_name": unit_name,
                    "province": province,
                    "district": district,
                    "subdistrict": subdistrict,
                    "department": department,
                }
            )
    # Deduplicate by (unit_type, unit_code, unit_name, province)
    seen = set()
    deduped = []
    for u in units:
        key = (u["unit_type"], u["unit_code"], u["unit_name"], u["province"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(u)
    return deduped


def pick_unit(units: list[dict], metric: Metric, rng: random.Random) -> dict:
    candidates = [u for u in units if u.get("unit_type") in metric.applicable_unit_types]
    if not candidates:
        candidates = units[:]  # last resort
    return rng.choice(candidates)


def required_keywords_for_question(text: str, metric: Metric) -> list[str]:
    req = set(metric.keywords)
    if "อ่างเก็บน้ำ" in text:
        req.add("อ่างเก็บน้ำ")
    if "สถานีวัดน้ำ" in text:
        req.add("สถานีวัดน้ำ")
    # Also enforce unit token when the question clearly implies it
    if metric.unit in ("มม.", "%"):
        req.add(metric.unit)
    if metric.domain == "simsat" and metric.unit:
        # In simsat we always want units consistent when present
        req.add(metric.unit)
    if "สัปดาห์ล่าสุด" in text:
        req.add("สัปดาห์ล่าสุด")
    if "สัปดาห์ก่อน" in text:
        req.add("สัปดาห์ก่อน")
    return [k for k in req if k]


def build_reference_answer(metric: Metric, unit: dict, scope: str, province: str | None = None) -> str:
    value_placeholder = f"<ตัวเลข> {metric.unit}".strip()

    if metric.domain == "simsat":
        plot_name = unit.get("plot_name") or ""
        start_date = unit.get("start_date") or "<start_date>"
        end_date = unit.get("end_date") or "<end_date>"
        time_label = unit.get("time_label") or ""
        fp = unit.get("farmplot_batch_id") or ""
        if scope == "specific":
            parts = [
                f"ตอบจาก dashboard วิเคราะห์ (simsat) ของ \"{plot_name}\"",
                f"{time_label} ({start_date} ถึง {end_date})".strip(),
                f"โดยรายงาน{metric.label} = {value_placeholder}",
            ]
            if fp:
                parts.append(f"อ้างอิง farmplot_batch_id {fp}")
            parts.append("ยืนยันหน่วยให้ตรงกับคำถาม และสรุปสั้นกระชับ")
            return " — ".join(parts)
        return (
            f"ควรสรุปจาก dashboard วิเคราะห์ (simsat) {time_label} ({start_date} ถึง {end_date}) "
            f"โดยสรุปอย่างน้อย Top 3 โครงการ/พื้นที่ที่เกี่ยวข้องกับ \"{metric.label}\" พร้อมค่า {value_placeholder} "
            f"ชื่อโครงการ/พื้นที่ และไม่ถามย้อนกลับให้ผู้ใช้ระบุ id เพิ่ม"
        )

    if scope == "specific":
        # Ensure the answer contains the key entity word(s).
        unit_type = unit.get("unit_type") or ""
        unit_name = unit.get("unit_name") or ""
        prov = unit.get("province") or ""
        dept = unit.get("department") or ""

        entity_phrase = unit_name
        if unit_type and unit_type not in unit_name:
            entity_phrase = f"{unit_type}{unit_name if unit_name.startswith(' ') else ' ' + unit_name}".strip()

        # If it is a reservoir question, make sure the literal "อ่างเก็บน้ำ" appears.
        reservoir_hint = "อ่างเก็บน้ำ" if unit_type in ("อ่างเก็บน้ำ", "อ่างขนาดเล็ก") else ""
        station_hint = "สถานีวัดน้ำ" if unit_type == "สถานีวัดน้ำ" else ""

        parts = [
            f"ตอบจาก dashboard ล่าสุดของ{reservoir_hint or station_hint or unit_type} \"{unit_name}\"",
            f"โดยรายงาน{metric.label} = {value_placeholder}",
        ]
        if prov:
            parts.append(f"ระบุพื้นที่จังหวัด{prov}")
        if dept:
            parts.append(f"ระบุหน่วยงานผู้รับผิดชอบ {dept}")
        parts.append("ระบุวัน-เวลาข้อมูลล่าสุด (data_date, data_time) ที่ใช้อ้างอิง")
        return " — ".join(parts)

    # aggregate
    prov = province or ""
    scope_label = f"ในจังหวัด{prov}" if prov else "ในพื้นที่สำนักชลประทานที่ 4"
    unit_type_hint = (
        "อ่างเก็บน้ำ" if "อ่างเก็บน้ำ" in metric.keywords else ("สถานีวัดน้ำ" if "สถานีวัดน้ำ" in metric.keywords else "หน่วย")
    )
    return (
        f"ควรสรุปจาก dashboard ล่าสุด {scope_label} โดยสรุปอย่างน้อย Top 3 {unit_type_hint} ที่เกี่ยวข้องกับ \"{metric.label}\" "
        f"พร้อมค่า {value_placeholder} ชื่อหน่วย และวัน-เวลาล่าสุด (ไม่ถามย้อนกลับให้ผู้ใช้ระบุรหัส/สถานีเพิ่ม)"
    )


def build_key_points(metric: Metric, scope: str) -> list[str]:
    if metric.domain == "simsat":
        if scope == "specific":
            return [
                "มีชื่อโครงการ/ชื่อพื้นที่ (plot_name) ที่ถูกถามในคำตอบ",
                f"มีตัวเลขพร้อมหน่วย {metric.unit}" if metric.unit else "มีตัวเลขของตัวชี้วัดที่ถูกถาม",
                "ระบุว่าเป็นสัปดาห์ล่าสุดหรือสัปดาห์ก่อน และช่วงวันที่ที่อ้างอิง",
            ]
        return [
            "สรุปผลแบบเปรียบเทียบ/จัดอันดับ (เช่น Top 3) ไม่ใช่ถามย้อนกลับ",
            f"มีตัวเลขพร้อมหน่วย {metric.unit}" if metric.unit else "มีตัวเลขของตัวชี้วัดที่ถูกถาม",
            "มีชื่อโครงการ/พื้นที่อย่างน้อย 3 รายการ และระบุว่าเป็นสัปดาห์ล่าสุดหรือสัปดาห์ก่อน",
        ]
    if scope == "specific":
        return [
            f"มีคำว่า \"{metric.keywords[0]}\" หรือชื่อหน่วยที่ถูกถามในคำตอบ",
            f"มีตัวเลขพร้อมหน่วย {metric.unit}",
            "ระบุวัน-เวลาล่าสุดที่อ้างอิง",
        ]
    return [
        "สรุปผลแบบเปรียบเทียบ/จัดอันดับ (เช่น Top 3) ไม่ใช่ถามย้อนกลับ",
        f"มีตัวเลขพร้อมหน่วย {metric.unit}",
        "มีชื่อหน่วย/สถานี/อ่างที่อ้างอิงอย่างน้อย 3 รายการ และมีวัน-เวลาล่าสุด",
    ]


def make_question(metric: Metric, unit: dict, rng: random.Random, aggregate_ratio: float) -> dict:
    if metric.domain == "simsat":
        is_aggregate = rng.random() < aggregate_ratio
        plot_name = unit.get("plot_name") or "rid4"
        start_date = unit.get("start_date") or "<start_date>"
        end_date = unit.get("end_date") or "<end_date>"
        time_label = unit.get("time_label") or "สัปดาห์ล่าสุด"
        unit_token = f"({metric.unit})" if metric.unit else ""

        if not is_aggregate:
            # Specific question (natural): ไม่ต้องเขียน "แปลง/โครงการ" ซ้ำ
            q_style = rng.choice(["value", "value", "compare"])

            if q_style == "compare" and unit.get("next_start_date") and unit.get("next_end_date"):
                q = f"{metric.label} {unit_token} ของ\"{plot_name}\" {time_label} เทียบกับสัปดาห์ล่าสุดต่างกันเท่าไร?"
                reference = (
                    f"ควรตอบจาก dashboard วิเคราะห์ (simsat) ของ \"{plot_name}\" โดยให้ค่า{metric.label} "
                    f"{time_label} ({start_date} ถึง {end_date}) = <ตัวเลข> {metric.unit} และสัปดาห์ล่าสุด "
                    f"({unit['next_start_date']} ถึง {unit['next_end_date']}) = <ตัวเลข> {metric.unit} "
                    f"พร้อมสรุปว่าเพิ่ม/ลดเท่าไร (หน่วย {metric.unit})"
                )
            else:
                q = f"{metric.label} {unit_token} ของ\"{plot_name}\" {time_label}เป็นเท่าไร?"
                reference = build_reference_answer(metric, unit, scope="specific")

            if unit.get("farmplot_batch_id") and rng.random() < 0.12:
                q = f"{q.rstrip('?')} (อ้างอิง id {unit['farmplot_batch_id']})?"
            kps = build_key_points(metric, scope="specific")
            return {
                "text": normalize_space(q),
                "type": "database",
                "questionScope": "specific",
                "referenceAnswer": reference,
                "keyPoints": kps,
                "requiredKeywords": required_keywords_for_question(q, metric),
            }

        # Aggregate/overview questions
        if plot_name.lower() == "rid4" and rng.random() < 0.35:
            q = f"{metric.label} {unit_token} ภาพรวมทั้งพื้นที่ สชป.4 {time_label}เป็นเท่าไร?"
        else:
            q = f"Top 3 โครงการ/พื้นที่ที่{metric.label}สูงสุด {time_label} คืออะไร และมีค่าเท่าไร {unit_token}?"
        reference = build_reference_answer(metric, unit, scope="aggregate")
        kps = build_key_points(metric, scope="aggregate")
        return {
            "text": normalize_space(q),
            "type": "database",
            "questionScope": "aggregate",
            "referenceAnswer": reference,
            "keyPoints": kps,
            "requiredKeywords": required_keywords_for_question(q, metric),
        }

    is_aggregate = rng.random() < aggregate_ratio
    province = unit.get("province") or rng.choice(RID4_PROVINCES)

    unit_type = unit.get("unit_type") or ""
    unit_name = unit.get("unit_name") or ""
    unit_code = unit.get("unit_code") or ""

    if not is_aggregate:
        # Specific question uses real unit_name/unit_code when present.
        target = unit_name
        if unit_type and unit_type not in target:
            # Make the asked entity explicit for keyword matching.
            if unit_type == "อ่างขนาดเล็ก":
                # Still force literal "อ่างเก็บน้ำ" in question occasionally.
                if rng.random() < 0.5 and "อ่างเก็บน้ำ" not in target:
                    target = f"อ่างเก็บน้ำ{target if target.startswith(' ') else ' ' + target}".strip()
                else:
                    target = f"{unit_type}{target if target.startswith(' ') else ' ' + target}".strip()
            else:
                target = f"{unit_type}{target if target.startswith(' ') else ' ' + target}".strip()

        if metric.unit in ("ม.", "มม.", "%", "ล้าน ลบ.ม.", "ลบ.ม./วินาที"):
            q = f"{metric.label}ของ{target}ล่าสุดเป็นเท่าไร ({metric.unit})?"
        else:
            q = f"{metric.label}ของ{target}ล่าสุดเป็นเท่าไร?"

        # Sometimes add location/code constraints.
        if unit_code and rng.random() < 0.35:
            q = q.replace("ของ", f"ของหน่วยรหัส {unit_code} ")
        if province and rng.random() < 0.25:
            q = q.replace("ล่าสุด", f"ล่าสุดในจังหวัด{province}")

        reference = build_reference_answer(metric, unit, scope="specific")
        kps = build_key_points(metric, scope="specific")
        return {
            "text": normalize_space(q),
            "type": "database",
            "questionScope": "specific",
            "referenceAnswer": reference,
            "keyPoints": kps,
            "requiredKeywords": required_keywords_for_question(q, metric),
        }

    # Aggregate question
    if "อ่างเก็บน้ำ" in metric.keywords:
        q = f"อ่างเก็บน้ำในจังหวัด{province} ที่{metric.label}สูงสุด Top 3 คืออ่างใดบ้าง และมีค่าเท่าไร ({metric.unit})?"
    elif "สถานีวัดน้ำ" in metric.keywords:
        q = f"สถานีวัดน้ำในจังหวัด{province} ที่{metric.label}สูงสุด Top 3 คือสถานีใดบ้าง และมีค่าเท่าไร ({metric.unit})?"
    else:
        q = f"ในจังหวัด{province} หน่วยใดมี{metric.label}สูงสุด Top 3 และค่าเท่าไร ({metric.unit})?"

    reference = build_reference_answer(metric, unit, scope="aggregate", province=province)
    kps = build_key_points(metric, scope="aggregate")
    return {
        "text": normalize_space(q),
        "type": "database",
        "questionScope": "aggregate",
        "referenceAnswer": reference,
        "keyPoints": kps,
        "requiredKeywords": required_keywords_for_question(q, metric),
    }


def ensure_keywords_in_reference(item: dict) -> dict:
    ref = item.get("referenceAnswer", "")
    missing = [kw for kw in item.get("requiredKeywords", []) if kw and kw not in ref]
    if missing:
        ref = f"{ref} — (ต้องมีคำว่า: {', '.join(missing)})"
    item["referenceAnswer"] = ref
    return item


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--units-csv", default="data_type.csv", help="Path to units catalog CSV")
    ap.add_argument("--dict-csv", default="", help="(Optional) data dictionary CSV for simsat dashboard")
    ap.add_argument("--sample-csv", default="", help="(Optional) sample data CSV for simsat (to pick plot_name/date)")
    ap.add_argument("-n", "--count", type=int, default=120, help="How many questions to generate")
    ap.add_argument("--seed", type=int, default=4, help="Random seed")
    ap.add_argument("--aggregate-ratio", type=float, default=0.3, help="Share of aggregate questions")
    ap.add_argument("--out", default="generated_dashboard_questions.json", help="Output JSON file path")
    args = ap.parse_args()

    rng = random.Random(args.seed)

    if args.dict_csv and args.sample_csv:
        metrics = load_simsat_metrics(Path(args.dict_csv))
        units = load_simsat_entities(Path(args.sample_csv))
        if not metrics:
            raise SystemExit(f"No metrics loaded from dict {args.dict_csv}")
        if not units:
            raise SystemExit(f"No entities loaded from sample {args.sample_csv}")
    else:
        metrics = METRICS
        units = load_units(Path(args.units_csv))
        if not units:
            raise SystemExit(f"No units loaded from {args.units_csv}")

    items: list[dict] = []
    for i in range(args.count):
        metric = rng.choice(metrics)
        unit = pick_unit(units, metric, rng) if metric.domain != "simsat" else rng.choice(units)
        q = make_question(metric, unit, rng, aggregate_ratio=args.aggregate_ratio)
        q = ensure_keywords_in_reference(q)
        q["id"] = i + 1
        items.append(q)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(items)} questions to {out_path}")


if __name__ == "__main__":
    main()

