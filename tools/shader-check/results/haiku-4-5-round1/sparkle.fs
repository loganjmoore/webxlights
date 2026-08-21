/*{
  "DESCRIPTION": "Random sparkles twinkling over a solid color background",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "bgColor", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.0, 1.0] },
    { "NAME": "sparkleColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "density", "TYPE": "float", "MIN": 0.01, "MAX": 1.0, "DEFAULT": 0.15 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  vec2 gridPos = floor(uv * 20.0);
  vec2 cellUv = fract(uv * 20.0);
  
  float h = hash(gridPos + vec2(TIME * speed * 0.5, 0.0));
  float twinkle = smoothstep(0.0, 0.3, sin(TIME * speed * 3.14159 + h * 6.28318)) * 0.7 + 0.3;
  
  float sparkle = 0.0;
  if (h < density) {
    float dist = length(cellUv - 0.5);
    sparkle = smoothstep(0.35, 0.0, dist) * twinkle;
  }
  
  vec3 color = mix(bgColor.rgb, sparkleColor.rgb, sparkle);
  gl_FragColor = vec4(color, 1.0);
}
