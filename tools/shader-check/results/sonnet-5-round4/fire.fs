/*{
  "DESCRIPTION": "Flickering fire rising from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float a = hash1(i);
  float b = hash1(i + 1.0);
  return mix(a, b, smoothstep(0.0, 1.0, f));
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool flat1D = RENDERSIZE.y < 2.0;

  float rise = TIME * speed * 0.6;

  float h;
  if (flat1D) {
    h = uv.x;
  } else {
    h = uv.y;
  }

  float n1 = noise1(uv.x * scale * 6.0 + rise * 4.0 + h * 2.0);
  float n2 = noise1(uv.x * scale * 12.0 - rise * 6.0 + h * 5.0 + 17.0);
  float flick = hash1(floor(TIME * 12.0 * speed) + uv.x * 3.0);

  float wave = mix(n1, n2, 0.4) + flick * 0.15;

  float travel = fract(h - rise * 0.5 - wave * 0.3);

  float flame = 1.0 - travel;
  flame = pow(clamp(flame, 0.0, 1.0), 2.0 + scale * 0.3);
  flame *= (0.7 + 0.3 * wave);
  flame *= intensity;

  float heat = clamp(flame, 0.0, 1.0);
  vec3 col = mix(colorB.rgb * 0.4, colorA.rgb, heat);
  col = mix(vec3(0.0), col, smoothstep(0.0, 0.15, heat));

  gl_FragColor = vec4(col, 1.0);
}
