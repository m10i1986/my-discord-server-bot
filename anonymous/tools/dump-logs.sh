#!/bin/bash
# dump-logs.sh — anonymous.db の全テーブルを CSV または YAML 形式でダンプする
# Usage: ./dump-logs.sh [--format csv|yaml] [--output <dir>]
#   --format  出力形式 (csv / yaml, デフォルト: csv)
#   --output  出力先ディレクトリ (デフォルト: stdout)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/../data/anonymous.db"
FORMAT="csv"
OUTPUT_DIR=""

TABLES=(
    "anonymous_posts"
    "user_consents"
)

# ── 引数解析 ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --format)
            FORMAT="${2,,}"  # 小文字に正規化
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            sed -n '2,4p' "$0" | sed 's/^# //'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ "$FORMAT" != "csv" && "$FORMAT" != "yaml" ]]; then
    echo "Error: --format must be 'csv' or 'yaml'" >&2
    exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
    echo "Error: database not found: $DB_PATH" >&2
    exit 1
fi

if ! command -v sqlite3 &>/dev/null; then
    echo "Error: sqlite3 command not found" >&2
    exit 1
fi

if [[ -n "$OUTPUT_DIR" ]]; then
    mkdir -p "$OUTPUT_DIR"
fi

# ── CSV ダンプ ───────────────────────────────────────────────────────────────
dump_csv() {
    local table="$1"
    local out

    if [[ -n "$OUTPUT_DIR" ]]; then
        out="${OUTPUT_DIR}/${table}.csv"
        sqlite3 -header -csv "$DB_PATH" "SELECT * FROM ${table};" > "$out"
        echo "Dumped: $out"
    else
        echo "=== ${table} ==="
        sqlite3 -header -csv "$DB_PATH" "SELECT * FROM ${table};"
        echo ""
    fi
}

# ── YAML ダンプ ──────────────────────────────────────────────────────────────
dump_yaml() {
    local table="$1"
    local out

    # カラム名を取得
    mapfile -t columns < <(
        sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('${table}') ORDER BY cid;"
    )

    # YAML 生成（Unit Separator \x1f で列を区切り）
    generate_yaml() {
        # SQLiteレベルで特殊文字をエスケープ: \ → \\, CR → \r, LF → \n, " → \"
        # これにより read コマンドがフィールド内改行で誤分割するのを防ぐ
        local escaped_cols=()
        for col in "${columns[@]}"; do
            escaped_cols+=("replace(replace(replace(replace(\"${col}\", char(92), '\\\\'), char(13), '\\r'), char(10), '\\n'), char(34), '\\\"') AS \"${col}\"")
        done
        local col_list
        col_list=$(IFS=','; echo "${escaped_cols[*]}")

        sqlite3 -separator $'\x1f' "$DB_PATH" "SELECT ${col_list} FROM ${table};" | \
        while IFS=$'\x1f' read -r -a values; do
            echo "  -"
            for i in "${!columns[@]}"; do
                local key="${columns[$i]}"
                local val="${values[$i]:-}"
                # \n \r またはYAML特殊文字を含む場合はダブルクォートで囲む
                local yaml_special_re='[:#|>{}\[\]&*!%@,]'
                if [[ "$val" == *'\n'* || "$val" == *'\r'* || "$val" =~ $yaml_special_re ]]; then
                    printf '    %s: "%s"\n' "$key" "$val"
                else
                    printf '    %s: %s\n' "$key" "${val:-null}"
                fi
            done
        done
    }

    if [[ -n "$OUTPUT_DIR" ]]; then
        out="${OUTPUT_DIR}/${table}.yaml"
        {
            echo "${table}:"
            generate_yaml
        } > "$out"
        echo "Dumped: $out"
    else
        echo "${table}:"
        generate_yaml
        echo ""
    fi
}

# ── 実行 ────────────────────────────────────────────────────────────────────
for table in "${TABLES[@]}"; do
    if [[ "$FORMAT" == "csv" ]]; then
        dump_csv "$table"
    else
        dump_yaml "$table"
    fi
done
