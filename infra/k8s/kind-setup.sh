#!/usr/bin/env bash
# One-shot local Kubernetes deploy: kind cluster + ingress-nginx + metrics-server
# + all InterviewHub images and manifests. App lands on http://localhost:8081
set -euo pipefail
cd "$(dirname "$0")/../.."

CLUSTER=interviewhub

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  # KIND_NODE_IMAGE lets you reuse a locally-cached kindest/node image on slow networks
  kind create cluster --name "$CLUSTER" --config infra/k8s/kind-config.yaml \
    ${KIND_NODE_IMAGE:+--image "$KIND_NODE_IMAGE"}
else
  echo "kind cluster '$CLUSTER' already exists — reusing."
fi
kubectl config use-context "kind-$CLUSTER"

echo "--- ingress-nginx"
curl -sfL --retry 8 --retry-delay 5 --retry-all-errors \
  "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/kind/deploy.yaml" \
  | kubectl apply -f -
kubectl wait --namespace ingress-nginx --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=300s

echo "--- metrics-server (for HPA)"
curl -sfL --retry 8 --retry-delay 5 --retry-all-errors \
  "https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml" \
  | kubectl apply -f -
# kind's kubelets use self-signed certs
kubectl patch deployment metrics-server -n kube-system --type json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

echo "--- building and loading images"
(cd infra && docker compose build)
for img in auth-service user-service post-service file-service comment-service notification-service frontend; do
  kind load docker-image "interviewhub/$img:dev" --name "$CLUSTER"
done
# preload infra images so the cluster never pulls them from the network
docker pull postgres:17-alpine >/dev/null 2>&1 || true
docker pull minio/minio:latest >/dev/null 2>&1 || true
docker pull apache/kafka:3.8.0 >/dev/null 2>&1 || true
kind load docker-image postgres:17-alpine --name "$CLUSTER"
kind load docker-image minio/minio:latest --name "$CLUSTER"
kind load docker-image apache/kafka:3.8.0 --name "$CLUSTER"

echo "--- applying manifests"
kubectl apply -f infra/k8s/00-namespace.yaml
bash infra/k8s/create-secrets.sh
kubectl apply -f infra/k8s/01-config.yaml
kubectl apply -f infra/k8s/10-postgres.yaml -f infra/k8s/11-minio.yaml -f infra/k8s/12-kafka.yaml
kubectl apply \
  -f infra/k8s/20-auth-service.yaml \
  -f infra/k8s/21-user-service.yaml \
  -f infra/k8s/22-post-service.yaml \
  -f infra/k8s/23-file-service.yaml \
  -f infra/k8s/24-comment-service.yaml \
  -f infra/k8s/25-notification-service.yaml \
  -f infra/k8s/30-frontend.yaml \
  -f infra/k8s/40-ingress.yaml

echo "--- waiting for rollout"
kubectl rollout status statefulset/postgres -n interviewhub --timeout=180s
kubectl rollout status statefulset/minio -n interviewhub --timeout=180s
for d in auth-service user-service post-service file-service comment-service notification-service frontend; do
  kubectl rollout status deployment/$d -n interviewhub --timeout=300s
done

echo
echo "InterviewHub is up: http://localhost:8081"
echo "Smoke test:        BASE_URL=http://localhost:8081 node scripts/smoke-test.mjs"
