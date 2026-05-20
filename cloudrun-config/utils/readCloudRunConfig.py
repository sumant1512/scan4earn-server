
#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

import yaml


def resolve_path(configfile: str) -> str:
    if os.path.isabs(configfile):
        return configfile

    cf = configfile.lstrip("./")
    if cf.startswith("cloudrun-config/"):
        return cf

    return os.path.join("cloudrun-config", cf)


def load_yaml(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def main():
    if len(sys.argv) < 2:
        print("Usage: readCloudRunConfig.py <configfile> [envfile]", file=sys.stderr)
        sys.exit(1)

    configfile = sys.argv[1]
    envfile = sys.argv[2] if len(sys.argv) > 2 else None

    resolved_config = resolve_path(configfile)
    print(f"loading config file: {resolved_config}", file=sys.stderr)

    config_values = load_yaml(resolved_config)

    merged_values = dict(config_values)

    if envfile:
        resolved_env = resolve_path(envfile)
        print(f"loading env file: {resolved_env}", file=sys.stderr)
        env_values = load_yaml(resolved_env)
        merged_values.update(env_values)

    # Keep same pattern as your example: stringify values in JSON
    target = {key: json.dumps(value) for key, value in merged_values.items()}

    with open("target.json", "w", encoding="utf-8") as json_file:
        json.dump(target, json_file, indent=4)

    print("target.json has been generated successfully.")


if __name__ == "__main__":
    main()
