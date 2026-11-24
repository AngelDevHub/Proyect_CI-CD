#!/usr/bin/env python3
"""
OpsTracker — EC2 Infrastructure Metrics Collector
Collects CPU, RAM, Network Bandwidth, and Temperature metrics from the EC2 instance
and streams them periodically via HTTP JSON to OpenObserve (/api/{ORG}/{STREAM}/_json).

Temperature Sensor vs AWS Virtualization Fallback:
- Checks /sys/class/thermal/thermal_zone*/temp for physical hardware thermal zones.
- Checks lm-sensors if available.
- If running on AWS EC2 virtualized instances (e.g. t2/t3/c5) where hypervisors (Nitro/Xen)
  do not expose MSR thermal registers to guest VMs, it computes a deterministic
  TDP-based thermal estimate based on CPU workload:
  Temp = T_ambient (32°C) + (T_max (75°C) - T_ambient) * (CPU% / 100) + random_jitter.
  The field "temperature_source" explicitly records "physical_sensor" or "estimated_tdp".
"""

import os
import time
import socket
import json
import base64
import glob
import random
import requests
import psutil

# Configuration from environment variables
OPENOBSERVE_URL = os.getenv("OPENOBSERVE_URL", "http://openobserve:5080").rstrip("/")
OPENOBSERVE_ORG = os.getenv("OPENOBSERVE_ORG", "default")
OPENOBSERVE_STREAM = os.getenv("OPENOBSERVE_METRICS_STREAM", "ec2_metrics")
OPENOBSERVE_USER = os.getenv("OPENOBSERVE_USER", "root@example.com")
OPENOBSERVE_PASSWORD = os.getenv("OPENOBSERVE_PASSWORD", "Complexpass#123")
COLLECTION_INTERVAL_SEC = int(os.getenv("METRICS_INTERVAL_SECONDS", "10"))

# Auth Header
AUTH_HEADER = os.getenv("OPENOBSERVE_AUTH_HEADER", "")
if not AUTH_HEADER:
    creds = f"{OPENOBSERVE_USER}:{OPENOBSERVE_PASSWORD}".encode("utf-8")
    AUTH_HEADER = f"Basic {base64.b64encode(creds).decode('utf-8')}"

HOSTNAME = socket.gethostname()

def get_instance_id() -> str:
    """Attempt to retrieve AWS EC2 instance ID via IMDSv2, falling back to hostname."""
    try:
        # Step 1: Obtain IMDSv2 token
        token_resp = requests.put(
            "http://169.254.169.254/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"},
            timeout=1,
        )
        if token_resp.status_code == 200:
            token = token_resp.text
            # Step 2: Fetch instance-id
            id_resp = requests.get(
                "http://169.254.169.254/latest/meta-data/instance-id",
                headers={"X-aws-ec2-metadata-token": token},
                timeout=1,
            )
            if id_resp.status_code == 200:
                return id_resp.text.strip()
    except Exception:
        pass
    return f"ec2-{HOSTNAME}"

INSTANCE_ID = get_instance_id()

def read_physical_temperature() -> float | None:
    """Read hardware thermal sensor from sysfs if present."""
    thermal_zones = glob.glob("/sys/class/thermal/thermal_zone*/temp")
    for zone in thermal_zones:
        try:
            with open(zone, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content.isdigit():
                    milli_celsius = float(content)
                    if 0 < milli_celsius < 150000:
                        return round(milli_celsius / 1000.0, 2)
        except Exception:
            continue

    # Try psutil sensors_temperatures
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for _, entries in temps.items():
                for entry in entries:
                    if entry.current and entry.current > 0:
                        return round(float(entry.current), 2)
    except Exception:
        pass

    return None

def calculate_temperature(cpu_percent: float) -> tuple[float, str]:
    """Returns (temperature_celsius, source_type)."""
    physical_temp = read_physical_temperature()
    if physical_temp is not None:
        return physical_temp, "physical_sensor"

    # Virtualization fallback: estimated TDP curve
    ambient = 32.0
    max_load_temp = 74.0
    load_factor = cpu_percent / 100.0
    jitter = random.uniform(-0.6, 0.6)
    estimated = ambient + ((max_load_temp - ambient) * load_factor) + jitter
    return round(max(30.0, min(85.0, estimated)), 2), "estimated_tdp"

class NetworkRateTracker:
    def __init__(self):
        self.last_time = time.time()
        net = psutil.net_io_counters()
        self.last_bytes_recv = net.bytes_recv
        self.last_bytes_sent = net.bytes_sent

    def get_rates(self) -> dict:
        now = time.time()
        elapsed = now - self.last_time
        if elapsed <= 0:
            elapsed = 1.0

        net = psutil.net_io_counters()
        rx_diff = max(0, net.bytes_recv - self.last_bytes_recv)
        tx_diff = max(0, net.bytes_sent - self.last_bytes_sent)

        self.last_time = now
        self.last_bytes_recv = net.bytes_recv
        self.last_bytes_sent = net.bytes_sent

        rx_bytes_sec = rx_diff / elapsed
        tx_bytes_sec = tx_diff / elapsed

        return {
            "network_rx_bytes_per_sec": round(rx_bytes_sec, 2),
            "network_tx_bytes_per_sec": round(tx_bytes_sec, 2),
            "network_rx_kbps": round((rx_bytes_sec * 8) / 1024.0, 2),
            "network_tx_kbps": round((tx_bytes_sec * 8) / 1024.0, 2),
            "network_rx_mbps": round((rx_bytes_sec * 8) / (1024.0 * 1024.0), 4),
            "network_tx_mbps": round((tx_bytes_sec * 8) / (1024.0 * 1024.0), 4),
        }

def collect_metrics(net_tracker: NetworkRateTracker) -> dict:
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_count = psutil.cpu_count(logical=True) or 1

    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    net_rates = net_tracker.get_rates()
    temp_celsius, temp_source = calculate_temperature(cpu_percent)

    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    return {
        "timestamp": timestamp,
        "service": "ec2-infrastructure",
        "instance_id": INSTANCE_ID,
        "hostname": HOSTNAME,
        # CPU
        "cpu_usage_percent": round(cpu_percent, 2),
        "cpu_core_count": cpu_count,
        # RAM
        "memory_total_mb": round(mem.total / (1024 * 1024), 2),
        "memory_used_mb": round(mem.used / (1024 * 1024), 2),
        "memory_free_mb": round(mem.available / (1024 * 1024), 2),
        "memory_usage_percent": round(mem.percent, 2),
        "swap_usage_percent": round(swap.percent, 2),
        # Bandwidth / Network
        **net_rates,
        # Temperature (Real or Estimated TDP fallback)
        "temperature_celsius": temp_celsius,
        "temperature_source": temp_source,
    }

def send_to_openobserve(metric_record: dict) -> bool:
    endpoint = f"{OPENOBSERVE_URL}/api/{OPENOBSERVE_ORG}/{OPENOBSERVE_STREAM}/_json"
    headers = {
        "Content-Type": "application/json",
        "Authorization": AUTH_HEADER,
    }
    # OpenObserve expects an array of JSON objects or newline-delimited objects
    payload = json.dumps([metric_record])

    try:
        response = requests.post(endpoint, data=payload, headers=headers, timeout=5)
        if response.status_code in (200, 201):
            return True
        print(f"[WARN] OpenObserve rejected metric (HTTP {response.status_code}): {response.text}")
    except Exception as e:
        print(f"[ERROR] Failed to reach OpenObserve endpoint ({endpoint}): {e}")

    return False

def main():
    print(f"============================================================")
    print(f" OpsTracker EC2 Metrics Collector started")
    print(f" Target: {OPENOBSERVE_URL}/api/{OPENOBSERVE_ORG}/{OPENOBSERVE_STREAM}/_json")
    print(f" Instance ID: {INSTANCE_ID} | Hostname: {HOSTNAME}")
    print(f" Interval: {COLLECTION_INTERVAL_SEC}s")
    print(f"============================================================")

    net_tracker = NetworkRateTracker()

    while True:
        try:
            metrics = collect_metrics(net_tracker)
            success = send_to_openobserve(metrics)
            status_str = "OK" if success else "FAILED"
            print(
                f"[{metrics['timestamp']}] {status_str} -> CPU: {metrics['cpu_usage_percent']}% | "
                f"RAM: {metrics['memory_usage_percent']}% | "
                f"Net TX: {metrics['network_tx_kbps']} kbps | "
                f"Temp: {metrics['temperature_celsius']}°C ({metrics['temperature_source']})"
            )
        except Exception as err:
            print(f"[EXCEPTION] Unhandled collector loop error: {err}")

        time.sleep(COLLECTION_INTERVAL_SEC)

if __name__ == "__main__":
    main()
