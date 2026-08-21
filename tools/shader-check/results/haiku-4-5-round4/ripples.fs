/*{
  "DESCRIPTION": "Raindrops falling and creating expanding circular ripples",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.8, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec3 col = vec3(0.0);
  
  float time = TIME * speed;
  
  for(int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = sin(fi * 12.9898) * 43758.5453;
    float dropX = fract(seed + time * 0.3);
    float dropY = fract(sin(fi * 78.233) * 43758.5453 + time * 0.25);
    
    vec2 dropPos = vec2(dropX, dropY);
    float dist = length(uv - dropPos);
    
    float ripple = sin(dist * density * 20.0 - time * 8.0) * 0.5 + 0.5;
    ripple *= exp(-dist * 3.0);
    ripple *= smoothstep(0.15, 0.0, abs(dist - 0.08));
    
    col += mix(colorA.rgb, colorB.rgb, fract(fi * 0.333)) * ripple;
  }
  
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
