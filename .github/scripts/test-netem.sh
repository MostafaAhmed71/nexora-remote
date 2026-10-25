#!/usr/bin/env bash
set -euo pipefail
# Two isolated network namespaces are not claimed as two Windows machines.
node_bin=$(command -v node)
ns=nexora-ci
link=nexora-host
server_pid=''
cleanup() { if [[ -n "$server_pid" ]]; then sudo kill "$server_pid" 2>/dev/null || true; fi; sudo ip netns del "$ns" 2>/dev/null || true; sudo ip link del "$link" 2>/dev/null || true; }
trap cleanup EXIT
mkdir -p artifacts
sudo ip netns add "$ns"
sudo ip link add "$link" type veth peer name nexora-peer
sudo ip link set nexora-peer netns "$ns"
sudo ip address add 10.203.0.1/30 dev "$link"
sudo ip link set "$link" up
sudo ip netns exec "$ns" ip address add 10.203.0.2/30 dev nexora-peer
sudo ip netns exec "$ns" ip link set nexora-peer up
sudo ip netns exec "$ns" ip link set lo up
sudo ip netns exec "$ns" "$node_bin" tests/netem-probe.mjs server > artifacts/netem-server.log 2>&1 &
server_pid=$!
# Bound startup check, internal address only, no public listeners or default route.
for attempt in {1..30}; do if sudo ip netns exec "$ns" ss -ltn | grep -q 18990; then break; fi; sleep 0.1; done
"$node_bin" tests/netem-probe.mjs client baseline artifacts/netem-baseline.json
sudo tc qdisc add dev "$link" root netem delay 80ms loss 5% rate 512kbit
sudo ip netns exec "$ns" tc qdisc add dev nexora-peer root netem delay 80ms loss 5% rate 512kbit
sudo tc -s qdisc show dev "$link" > artifacts/netem-qdisc.txt
"$node_bin" tests/netem-probe.mjs client impaired artifacts/netem-impaired.json
sudo tc -s qdisc show dev "$link" >> artifacts/netem-qdisc.txt
