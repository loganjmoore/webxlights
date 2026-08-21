/*{
  "DESCRIPTION": "Twinkling stars scattered across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "starColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "backgroundColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.1, 1.0] },
    { "NAME": "twinkleSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "starDensity", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 gridPos = uv * starDensity * 8.0;
  vec2 gridCell = floor(gridPos);
  vec2 cellUv = fract(gridPos);
  
  float starSeed = hash(gridCell);
  float starThreshold = 0.7;
  
  vec3 finalColor = backgroundColor.rgb;
  
  if (starSeed > starThreshold) {
    vec2 starCenter = vec2(0.5, 0.5);
    float distToCenter = length(cellUv - starCenter);
    
    if (distToCenter < 0.35) {
      float twinkle = abs(sin(TIME * twinkleSpeed + starSeed * 6.28));
      float brightness = smoothstep(0.35, 0.0, distToCenter) * (0.4 + twinkle * 0.6);
      finalColor = mix(finalColor, starColor.rgb, brightness);
    }
  }
  
  gl_FragColor = vec4(finalColor, 1.0);
}
