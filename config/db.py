"""Conexion reutilizable a MySQL."""
import mysql.connector
from dotenv import load_dotenv
import os

load_dotenv('config/.env')

def get_connection():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME', 'sponsorship_mvp'),
        port=int(os.getenv('DB_PORT', 3306))
    )

def execute_query(query, params=None, fetch=True):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query, params)
    if fetch:
        result = cursor.fetchall()
    else:
        conn.commit()
        result = cursor.rowcount
    cursor.close()
    conn.close()
    return result

def insert_many(query, data):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executemany(query, data)
    conn.commit()
    count = cursor.rowcount
    cursor.close()
    conn.close()
    return count

if __name__ == '__main__':
    conn = get_connection()
    print(f'Conexion OK: {conn.server_host}:{conn.server_port}')
    conn.close()
