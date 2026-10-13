// WebGL port of Shaders/BaseWarp.metal (originally by trinketMage: https://www.shadertoy.com/view/tdG3Rd)

const VERTEX_SHADER = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 iResolution;
uniform float time;

float colormap_red(float x) {
  if (x < 0.0) return 54.0 / 255.0;
  else if (x < 20049.0 / 82979.0) return (829.79 * x + 54.51) / 255.0;
  else return 1.0;
}

float colormap_green(float x) {
  if (x < 20049.0 / 82979.0) return 0.0;
  else if (x < 327013.0 / 810990.0) return (8546482679670.0 / 10875673217.0 * x - 2064961390770.0 / 10875673217.0) / 255.0;
  else if (x <= 1.0) return (103806720.0 / 483977.0 * x + 19607415.0 / 483977.0) / 255.0;
  else return 1.0;
}

float colormap_blue(float x) {
  if (x < 0.0) return 54.0 / 255.0;
  else if (x < 7249.0 / 82979.0) return (829.79 * x + 54.51) / 255.0;
  else if (x < 20049.0 / 82979.0) return 127.0 / 255.0;
  else if (x < 327013.0 / 810990.0) return (792.02249341361393720147485376583 * x - 64.364790735602331034989206222672) / 255.0;
  else return 1.0;
}

vec4 colormap(float x) {
  return vec4(colormap_red(x), colormap_green(x), colormap_blue(x), 1.0);
}

float rand(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  float res = mix(
    mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
    mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
  return res * res;
}

const mat2 mtx = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p, float t) {
  float f = 0.0;
  f += 0.500000 * noise(p + t); p = mtx * p * 2.02;
  f += 0.031250 * noise(p); p = mtx * p * 2.01;
  f += 0.250000 * noise(p); p = mtx * p * 2.03;
  f += 0.125000 * noise(p); p = mtx * p * 2.01;
  f += 0.062500 * noise(p); p = mtx * p * 2.04;
  f += 0.015625 * noise(p + sin(t));
  return f / 0.96875;
}

float pattern(vec2 p, float t) {
  return fbm(p + fbm(p + fbm(p, t), t), t);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.x;
  float shade = pattern(uv, time * 0.8);
  gl_FragColor = vec4(colormap(shade).rgb, 1.0);
}
`;

function startWarpShader(canvas) {
  const gl = canvas.getContext('webgl');
  if (!gl) return;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
    return shader;
  };

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  gl.useProgram(program);

  // Full-screen quad
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const resolution = gl.getUniformLocation(program, 'iResolution');
  const time = gl.getUniformLocation(program, 'time');
  const start = performance.now();

  const frame = () => {
    const width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.clientHeight * devicePixelRatio;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(resolution, width, height);
    gl.uniform1f(time, (performance.now() - start) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
