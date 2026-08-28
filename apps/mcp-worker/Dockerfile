FROM docker.io/cloudflare/sandbox:0.7.0

ARG NODE_VERSION=22.14.0

RUN npm install --global n@10.2.0 \
    && n "${NODE_VERSION}" \
    && test "$(/usr/local/bin/node --version)" = "v${NODE_VERSION}" \
    && /usr/local/bin/npm install --global @openai/codex@0.150.1
RUN node -e "require('node:sqlite')" \
    && codex --version \
    && codex --ask-for-approval never --config 'shell_environment_policy.inherit="core"' exec --help >/dev/null

EXPOSE 8080
