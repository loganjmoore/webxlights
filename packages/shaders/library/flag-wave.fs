/*{
  "DESCRIPTION": "A red white and blue flag rippling in a steady breeze",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.05, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.05, 0.15, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripes", "TYPE": "float", "MIN": 3.0, "MAX": 13.0, "DEFAULT": 7.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float t = mod(TIME * speed, 62.831853);
  // The breeze: a wave travelling along the flag, and the cloth's shading follows its slope.
  float phase = uv.x * 8.0 - t * 2.0;
  float wave = sin(phase);
  float shade = 0.72 + 0.28 * cos(phase + 0.8);
  vec3 col;
  if (isLine) {
    // A line shows the stripes running along it, carried by the same breeze.
    float s = mod(floor(fract(uv.x - t * 0.05) * stripes), 2.0);
    col = mix(colorA.rgb, colorB.rgb, s);
  } else {
    float yy = uv.y + 0.035 * wave;
    float s = mod(floor(clamp(yy, 0.0, 0.999) * stripes), 2.0);
    col = mix(colorA.rgb, colorB.rgb, s);
    // The canton, top left, with a few stars in it.
    if (uv.x < 0.42 && yy > 0.53) {
      vec2 cell = floor(vec2(uv.x / 0.42, (yy - 0.53) / 0.47) * vec2(4.0, 3.0));
      vec2 local = fract(vec2(uv.x / 0.42, (yy - 0.53) / 0.47) * vec2(4.0, 3.0)) - 0.5;
      float star = smoothstep(0.22, 0.1, length(local)) * step(0.5, mod(cell.x + cell.y + 1.0, 2.0));
      col = mix(colorC.rgb, colorB.rgb, star);
    }
  }
  gl_FragColor = vec4(col * shade, 1.0);
}
