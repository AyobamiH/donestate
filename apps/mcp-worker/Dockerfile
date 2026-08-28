FROM docker.io/cloudflare/sandbox:0.7.0

RUN npm install --global @openai/codex@0.150.1
RUN codex --version && codex --ask-for-approval never --config 'shell_environment_policy.inherit="core"' exec --help >/dev/null

EXPOSE 8080
