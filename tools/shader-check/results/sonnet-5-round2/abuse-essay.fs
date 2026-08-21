/*{
  "DESCRIPTION": "Bands of color crumble and rebuild across the display like falling blocks",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "blocks", "TYPE": "long", "MIN": 4.0, "MAX": 16.0, "DEFAULT": 10.0 }
  ]
}*/
void main() {
  bool isLine = RENDERSIZE.y < 2.0;
  vec2 uv = isf_FragNormCoord;
  float axis = isLine ? uv.x : uv.x;

  float n = float(blocks);
  float cell = floor(axis * n);

  float seed = fract(sin(cell * 91.345) * 47453.5);
  float fallSpeed = 0.4 + seed * 0.8;
  float t = TIME * speed * fallSpeed + seed * 10.0;

  float cyclePos = fract(t * 0.3);

  float crumble = smoothstep(0.0, 0.15, cyclePos) - smoothstep(0.4, 0.6, cyclePos);
  float rebuild = smoothstep(0.6, 1.0, cyclePos);

  float intensity = mix(1.0, 0.15, crumble);
  intensity = mix(intensity, 1.0, rebuild);

  float colorMix = fract(seed * 3.0 + floor(t * 0.3) * 0.37);
  vec3 base;
  if (colorMix < 0.34) {
    base = colorA.rgb;
  } else if (colorMix < 0.67) {
    base = colorB.rgb;
  } else {
    base = colorC.rgb;
  }

  float flicker = 1.0;
  if (crumble > 0.3) {
    float shatter = fract(sin(cell * 12.9898 + floor(TIME * speed * 8.0)) * 43758.5);
    flicker = mix(1.0, shatter, crumble);
  }

  vec3 col = base * intensity * flicker;
  col = max(col, base * 0.05);

  gl_FragColor = vec4(col, 1.0);
}
