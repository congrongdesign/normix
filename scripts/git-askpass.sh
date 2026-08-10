#!/usr/bin/env bash

case "$1" in
  *Username*) printf 'x-access-token\n' ;;
  *) printf '%s\n' "${GH_TOKEN:-}" ;;
esac
