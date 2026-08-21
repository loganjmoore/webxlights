/*{
  "DESCRIPTION": "A comet with a long tail circling around the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorComet", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorTail", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.1, "MAX": 0.8, "DEFAULT": 0.4 },
    { "NAME": "cometSize", "TYPE": "float", "MIN": 0.01, "MAX": 0.2, "DEFAULT": 0.08 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 center = vec2(0.5, 0.5);
  
  float angle = atan(uv.y - center.y, uv.x - center.x);
  float distance = length(uv - center);
  
  float cometAngle = TIME * speed * 2.0;
  float cometDist = 0.35;
  vec2 cometPos = center + vec2(cos(cometAngle), sin(cometAngle)) * cometDist;
  
  float distToComet = length(uv - cometPos);
  float cometCore = smoothstep(cometSize + 0.01, cometSize - 0.01, distToComet);
  
  float angleDiff = atan(uv.y - center.y, uv.x - center.x) - cometAngle;
  angleDiff = mod(angleDiff + 3.14159, 6.28318) - 3.14159;
  
  float behindComet = smoothstep(0.15, -0.15, angleDiff);
  float tailFade = smoothstep(tailLength, 0.0, distance - cometDist + 0.05);
  float tail = behindComet * tailFade * (1.0 - distToComet / tailLength);
  tail = max(0.0, tail);
  
  vec3 color = mix(colorTail.rgb, colorComet.rgb, cometCore);
  color = mix(color * 0.3, colorTail.rgb, tail * 0.8);
  
  float alpha = max(cometCore, tail * 0.6);
  
  gl_FragColor = vec4(color, alpha);
}
