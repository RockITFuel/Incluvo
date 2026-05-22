# Incluvo

Static hosted demo for the Incluvo prototype exported from Claude Design.

## Run locally

```sh
docker build -t incluvo-demo .
docker run --rm -p 8080:80 incluvo-demo
```

Open `http://localhost:8080`.

The original exported prototype is kept at `demo/Incluvo Prototype.html`; the Docker image also copies it to `index.html` so nginx serves it at `/`.
