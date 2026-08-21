/*{
  "DESCRIPTION": "Bands of alternating colour sweep sideways like a global chain of holiday greetings",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 10.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;
  float pos = isRoofline ? uv.x : uv.x;

  float t = TIME * speed * 0.2;
  float p = fract(pos + t) * bands;
  float idx = floor(mod(p, bands));
  float third = mod(idx, 3.0);

  vec3 col = mix(colorA.rgb, colorB.rgb, step(1.0, third));
  col = mix(col, colorC.rgb, step(2.0, third));

  float edge = fract(p);
  float glow = smoothstep(0.0, 0.08, edge) * smoothstep(1.0, 0.92, edge);
  col *= mix(0.7, 1.0, glow);

  gl_FragColor = vec4(col, 1.0);
}
