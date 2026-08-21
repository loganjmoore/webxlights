/*{
  "DESCRIPTION": "Two colors crumble apart into scattered blocks like collapsing pillars",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.8, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.75, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "columns", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "collapse", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoof = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.5;

  float mainAxis = isRoof ? uv.x : uv.x;
  float col = floor(mainAxis * columns);
  float colFrac = fract(mainAxis * columns);

  float seed = fract(sin(col * 12.9898) * 43758.5453);
  float cycle = fract(t * 0.2 + seed);

  float driveAxis = isRoof ? mainAxis : uv.y;

  float fallAmt = pow(cycle, 2.0) * collapse;
  float pos = isRoof ? fract(driveAxis + fallAmt * 2.0) : (1.0 - driveAxis) - fallAmt * 1.5;

  float block = step(0.5, fract((isRoof ? pos * columns + colFrac : pos * 6.0) + seed * 3.0));

  float flicker = 0.85 + 0.15 * sin(t * 6.0 + col * 3.0 + cycle * 10.0);

  float mixAmt = step(0.5, fract(col * 0.37 + cycle * 0.5));
  vec3 baseColor = mix(colorA.rgb, colorB.rgb, mixAmt);

  float shade = mix(1.0, 0.35, cycle);
  vec3 col3 = baseColor * shade * flicker;

  float glow = smoothstep(0.0, 0.15, cycle) * smoothstep(0.4, 0.15, cycle);
  col3 += colorB.rgb * glow * 0.5;

  gl_FragColor = vec4(clamp(col3, 0.0, 1.0), 1.0);
}
