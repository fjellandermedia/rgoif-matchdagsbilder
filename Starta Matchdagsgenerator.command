#!/bin/bash
cd "$(dirname "$0")"
echo "Startar Matchdagsgenerator — webbläsaren öppnas automatiskt om ett par sekunder."
echo "Håll det här fönstret öppet medan du använder appen. Stäng det (eller tryck Ctrl+C) när du är klar."
echo ""
python3 server.py
