from flask import Flask, jsonify, render_template, request

import db
import plan
import oee

app = Flask(__name__)

PORT = 8787


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/plan")
def api_plan():
    dfrom = (request.args.get("from") or "").strip()
    dto = (request.args.get("to") or "").strip()
    try:
        dates = db.fetch_dates()
        est_rows, act_rows = db.fetch_plan_rows(dfrom, dto)
    except Exception as e:
        return jsonify({"error": "Gagal membaca database: " + str(e)}), 502
    result = plan.compute(est_rows, act_rows, dfrom, dto)
    result["dates"] = dates
    return jsonify(result)


@app.route("/api/oee")
def api_oee():
    dfrom = (request.args.get("from") or "").strip()
    dto = (request.args.get("to") or "").strip()
    try:
        rows = db.fetch_oee_rows(dfrom, dto)
    except Exception as e:
        return jsonify({"error": "Gagal membaca database: " + str(e)}), 502
    return jsonify(oee.compute(rows, dfrom, dto))


def main():
    print("Dashboard berjalan di http://localhost:" + str(PORT))
    print("Tekan Ctrl+C (atau tutup window ini) untuk berhenti.")
    try:
        app.run(host="127.0.0.1", port=PORT, threaded=True)
    except OSError as e:
        print("Gagal menjalankan server di port " + str(PORT) + ": " + str(e))
        print("Mungkin dashboard lain sudah berjalan di port ini.")


if __name__ == "__main__":
    main()
