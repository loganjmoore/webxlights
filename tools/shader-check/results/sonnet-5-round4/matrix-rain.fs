/*{
  "DESCRIPTION": "Green digital rain streaks falling down the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.15, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.3, 0.05, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 2.0, "MAX": 24.0, "DEFAULT": 10.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.9, "DEFAULT": 0.35 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  vec2 p = isRoofline ? vec2(uv.y, uv.x) : uv;

  float cols = density;
  float col = floor(p.x * cols);
  float colFrac = fract(p.x * cols);

  float colSeed = hash(col + 0.37);
  float fallSpeed = 0.4 + colSeed * 0.8;
  float phase = colSeed * 10.0;

  float fall = fract(p.y - TIME * speed * fallSpeed - phase);

  float streakLen = mix(0.15, 0.55, hash(col + 5.1));
  float head = smoothstep(streakLen, 0.0, fall);

  float lineMask = smoothstep(0.5, 0.5 - sharpness * 0.5, abs(colFrac - 0.5));

  float brightness = head * lineMask;

  float flicker = 0.85 + 0.15 * hash(col + floor(TIME * 6.0 + phase * 3.0));
  brightness *= flicker;

  vec3 color = mix(colorB.rgb, colorA.rgb, clamp(brightness * 1.4, 0.0, 1.0));
  color *= max(brightness, 0.06);

  gl_FragColor = vec4(color, 1.0);
}
