#!/bin/sh
# Serves every business's Beancount ledger in one Fava, on 127.0.0.1:5055.
# `hq new-business` and `hq finance init` restart the service so new books appear.
DATA="${HQ_DATA:-$HOME/hq-data}"
set -- "$DATA"/businesses/*/finance/ledger.beancount
if [ ! -e "$1" ]; then
  echo "no ledgers yet under $DATA/businesses; waiting"
  exec sleep 86400
fi
exec "$HOME/.local/bin/fava" --host 127.0.0.1 --port 5055 "$@"
