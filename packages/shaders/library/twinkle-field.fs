/*{
  "DESCRIPTION": "A field of stars twinkling softly at different times over a deep coloured background",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.05, 0.15, 0.7, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.45 },
    { "NAME": "background", "TYPE": "float", "MIN": 0.1, "MAX": 0.8, "DEFAULT": 0.4 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  // Every pixel is its own star: the point of a twinkle is that neighbours differ.
  vec2 cell = floor(uv * RENDERSIZE);
  float t = mod(TIME * speed, 62.831853);
  float h = hash(cell);
  float h2 = hash(cell + 19.0);
  float h3 = hash(cell + 41.0);
  // Only some pixels are stars, and each has its own phase and its own rate (0.8, 1.0 or 1.2,
  // all tenths so the wrap at 20 pi is seamless). The phase comes from its own hash: taking
  // it from the one that chose the star would give every star a phase in the same half-turn,
  // and they would all blink together.
  float isStar = step(1.0 - density, h);
  float rate = 0.8 + 0.2 * floor(h3 * 3.0);
  float pulse = 0.5 + 0.5 * sin(t * rate + h2 * 6.2831853);
  // Sharpened, so a star is mostly off and then bright rather than a slow uniform shimmer.
  float star = isStar * pow(pulse, 4.0);
  vec3 col = colorB.rgb * background;
  col = mix(col, colorA.rgb, star);
  gl_FragColor = vec4(col, 1.0);
}
