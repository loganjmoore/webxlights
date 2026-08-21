/*{
  "DESCRIPTION": "Cascading red and gold sparkles falling down a Christmas light display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 2.0, "MAX": 20.0, "DEFAULT": 8.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 workUv = uv;
  
  if (RENDERSIZE.y < 2.0) {
    workUv.y = fract(uv.x * 0.5 + TIME * speed * 0.3);
    workUv.x = uv.y;
  } else {
    workUv.y = fract(uv.y + TIME * speed * 0.3);
  }
  
  vec2 gridPos = fract(workUv * scale);
  vec2 cellId = floor(workUv * scale);
  
  float seed = sin(cellId.x * 12.9898 + cellId.y * 78.233) * 43758.5453;
  seed = fract(seed);
  
  float sparkle = smoothstep(0.6, 0.2, length(gridPos - 0.5));
  sparkle *= step(0.7, seed);
  sparkle *= sin(TIME * speed * 3.0 + seed * 6.28) * 0.5 + 0.5;
  
  vec3 color = mix(colorA.rgb, colorB.rgb, seed);
  gl_FragColor = vec4(color * sparkle, 1.0);
}
