"""Migration runner — estilo Laravel (artisan migrate) para MySQL.

Uso:
    docker-compose exec api python -m scripts.migrate          # correr pendientes
    docker-compose exec api python -m scripts.migrate --status # ver estado
    docker-compose exec api python -m scripts.migrate --reset  # forzar re-correr todas (peligroso)

Localmente (sin docker):
    python -m scripts.migrate

Los archivos SQL viven en sql/migrations/ y se ejecutan en orden alfabetico.
El runner tracke cuales ya se aplicaron en la tabla `_migrations`.
Es tolerante a errores de "ya existe" (duplicate column/index/table).
"""
from __future__ import annotations
import os
import sys
import argparse
from datetime import datetime

# Permitir ejecutar tanto como `python -m scripts.migrate` como `python scripts/migrate.py`
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_THIS_DIR)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

try:
    from api.database import get_connection
except ImportError:
    # Fallback: leer config directo si estamos fuera de docker
    import mysql.connector
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_ROOT, 'config', '.env'))

    def get_connection():
        return mysql.connector.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASSWORD', ''),
            database=os.getenv('DB_NAME', 'sponsorship_mvp'),
            port=int(os.getenv('DB_PORT', 3306)),
        )


MIGRATIONS_DIR = os.path.join(_ROOT, 'sql', 'migrations')

# Errores que indican "ya existe" → se consideran OK
IGNORABLE_ERRORS = (
    'Duplicate column',
    'Duplicate key',
    'already exists',
    'Duplicate entry',
    "Can't DROP",  # al intentar tirar algo que ya no existe
)


def _ensure_migrations_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(200) UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            rows_affected INT DEFAULT 0
        ) ENGINE=InnoDB
    """)


def _list_migrations():
    if not os.path.isdir(MIGRATIONS_DIR):
        return []
    return sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith('.sql'))


def _already_applied(cursor) -> set[str]:
    cursor.execute("SELECT filename FROM _migrations")
    return {row[0] for row in cursor.fetchall()}


def _clean_stmt(raw: str) -> str:
    """Remueve lineas de comentarios y espacios. Devuelve '' si no queda SQL ejecutable."""
    lines = []
    for line in raw.split('\n'):
        stripped = line.lstrip()
        if not stripped or stripped.startswith('--'):
            continue
        # Quitar comentario inline al final de la linea (pero no dentro de strings)
        lines.append(line)
    return '\n'.join(lines).strip()


def _split_statements(sql: str) -> list[str]:
    """Split SQL en statements. Maneja strings con ; adentro y comentarios entre stmts."""
    stmts = []
    current = []
    in_string = False
    string_char = None
    for ch in sql:
        if in_string:
            current.append(ch)
            if ch == string_char:
                in_string = False
        else:
            if ch in ("'", '"'):
                in_string = True
                string_char = ch
                current.append(ch)
            elif ch == ';':
                stmt = _clean_stmt(''.join(current))
                if stmt:
                    stmts.append(stmt)
                current = []
            else:
                current.append(ch)
    stmt = _clean_stmt(''.join(current))
    if stmt:
        stmts.append(stmt)
    return stmts


def run_migrations(dry_run: bool = False):
    conn = get_connection()
    cursor = conn.cursor()
    _ensure_migrations_table(cursor)
    conn.commit()

    files = _list_migrations()
    applied = _already_applied(cursor)
    pending = [f for f in files if f not in applied]

    if not pending:
        print("✅ Nada que migrar. Todo al dia.")
        cursor.close(); conn.close()
        return

    print(f"📦 {len(pending)} migraciones pendientes:\n")
    for f in pending:
        print(f"  → {f}")
    print()

    for f in pending:
        print(f"▶ Aplicando {f}...")
        path = os.path.join(MIGRATIONS_DIR, f)
        with open(path, 'r', encoding='utf-8') as fp:
            sql = fp.read()

        statements = _split_statements(sql)
        skipped = 0
        rows = 0

        for i, stmt in enumerate(statements, 1):
            if dry_run:
                print(f"   [dry] stmt {i}/{len(statements)}: {stmt[:80]}...")
                continue
            try:
                cursor.execute(stmt)
                rows += cursor.rowcount if cursor.rowcount > 0 else 0
            except Exception as e:
                msg = str(e)
                if any(ign in msg for ign in IGNORABLE_ERRORS):
                    skipped += 1
                    print(f"   ⚠ skip (ya aplicado): {msg[:120]}")
                else:
                    conn.rollback()
                    print(f"   ❌ ERROR en statement {i}/{len(statements)}:")
                    print(f"      {stmt[:200]}")
                    print(f"      → {e}")
                    cursor.close(); conn.close()
                    sys.exit(1)

        if not dry_run:
            cursor.execute(
                "INSERT INTO _migrations (filename, rows_affected) VALUES (%s, %s)",
                (f, rows),
            )
            conn.commit()
            print(f"   ✅ OK — {len(statements)} statements, {rows} rows, {skipped} skip\n")

    cursor.close(); conn.close()
    print(f"🎉 Migraciones completadas.")


def show_status():
    conn = get_connection()
    cursor = conn.cursor()
    _ensure_migrations_table(cursor)
    conn.commit()

    files = _list_migrations()
    applied = _already_applied(cursor)

    print("\n📋 Estado de migraciones:\n")
    if not files:
        print("  (no hay archivos en sql/migrations/)")
    for f in files:
        mark = "✅" if f in applied else "⏳"
        print(f"  {mark} {f}")

    pending = [f for f in files if f not in applied]
    print(f"\n  Total: {len(files)} | Aplicadas: {len(applied)} | Pendientes: {len(pending)}\n")
    cursor.close(); conn.close()


def reset():
    """Borra la tabla _migrations para que todas se re-ejecuten (CUIDADO)."""
    answer = input("⚠  Esto borrara el registro de migraciones (no las tablas). Continuar? (yes/no): ")
    if answer.lower() != "yes":
        print("Cancelado.")
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS _migrations")
    conn.commit()
    print("🗑  Tabla _migrations borrada. Proxima corrida re-aplicara todas las migraciones.")
    cursor.close(); conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migration runner")
    parser.add_argument("--status", action="store_true", help="Ver estado de migraciones")
    parser.add_argument("--reset", action="store_true", help="Borrar _migrations (peligroso)")
    parser.add_argument("--dry-run", action="store_true", help="Simular sin ejecutar")
    args = parser.parse_args()

    if args.status:
        show_status()
    elif args.reset:
        reset()
    else:
        run_migrations(dry_run=args.dry_run)
