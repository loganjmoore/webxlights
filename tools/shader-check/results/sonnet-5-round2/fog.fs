/*{
  "DESCRIPTION": "Spooky green fog drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.02, 0.15, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.9, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 },
    { "NAME": "murk", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool flat1D = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.15;

  vec2 p;
  if (flat1D) {
    p = vec2(uv.x * density * 4.0 - t * 2.0, t * 0.5);
  } else {
    p = vec2(uv.x * density * 4.0 - t * 2.0, uv.y * density * 2.0 + t * 0.5);
  }

  float n1 = noise(p);
  float n2 = noise(p * 1.7 + vec2(5.2, 1.3) - t);
  float fog = n1 * 0.6 + n2 * 0.4;

  fog = smoothstep(0.2, 0.9, fog);

  float shimmer = 0.5 + 0.5 * sin(TIME * speed * 0.6 + uv.x * 6.0);
  fog = mix(fog, fog * shimmer, murk * 0.3);

  vec3 col = mix(colorA.rgb, colorB.rgb, fog);

  float vign = 1.0 - murk * 0.3 * (1.0 - fog);
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
